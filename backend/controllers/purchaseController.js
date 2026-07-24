/**
 * Purchases — self-training program sales.
 * A Purchase is created 'unpaid', paid through the same CyberSource flow
 * as appointments, and unlocks the program content once 'paid'.
 */
const { Purchase, Service, Appointment, ShopSettings } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { logActivity }  = require('../utils/activityLog');

/* POST /api/purchases  { serviceId } — start a purchase (unpaid) */
/* Sanitize the custom-program intake questionnaire */
function cleanIntake(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
  const num = (v, lo, hi) => { const n = Number(v); return (!isNaN(n) && n >= lo && n <= hi) ? n : null; };
  return {
    daysPerWeek: num(raw.daysPerWeek, 1, 7),
    weightKg:    num(raw.weightKg, 20, 400),
    heightCm:    num(raw.heightCm, 80, 260),
    age:         num(raw.age, 10, 100),
    goal:        str(raw.goal, 100),
    notes:       str(raw.notes, 500),
  };
}

exports.createPurchase = asyncHandler(async (req, res) => {
  const { serviceId, wantsNutrition, intake } = req.body;
  if (!serviceId)
    return res.status(400).json({ success: false, message: 'serviceId is required' });

  const service = await Service.findById(serviceId);
  if (!service || !service.isActive)
    return res.status(404).json({ success: false, message: 'Program not found' });

  // Already owns it? (An EXPIRED paid purchase can be renewed — it's not a
  // block, it just goes through checkout again on the same Purchase doc.)
  const alreadyPaid = await Purchase.findOne({ user: req.user._id, service: serviceId, paymentStatus: 'paid', accessStatus: { $ne: 'expired' } });
  if (alreadyPaid)
    return res.status(409).json({ success: false, message: 'You already own this program — find it in your dashboard.' });

  // Reuse an existing unpaid/failed/expired purchase instead of stacking
  // duplicates, and refresh its price to the CURRENT admin-set price
  // (server-side price only). Reusing the same doc on renewal means its
  // linked WorkoutPlan/NutritionPlan (never deleted, just hidden) reappears
  // automatically once payment succeeds.
  let purchase = await Purchase.findOne({
    user: req.user._id, service: serviceId,
    $or: [
      { paymentStatus: { $in: ['unpaid', 'failed', 'pending'] } },
      { paymentStatus: 'paid', accessStatus: 'expired' },
    ],
  });
  // Nutrition add-on price snapshot (admin-set, server-side)
  let nutriPrice = 0;
  if (wantsNutrition) {
    const st = await ShopSettings.findOne({ singleton: 'main' });
    nutriPrice = Number(st?.nutritionPrice || 0);
  }
  const cleanedIntake = cleanIntake(intake);
  const amount = Number(service.price) + (wantsNutrition ? nutriPrice : 0);

  if (purchase) {
    purchase.amount = amount;
    purchase.paymentStatus = 'unpaid';
    purchase.cyberSourceOrderId = '';
    purchase.wantsNutrition = Boolean(wantsNutrition);
    purchase.nutritionPrice = nutriPrice;
    if (cleanedIntake) purchase.intake = cleanedIntake;
    await purchase.save();
  } else {
    purchase = await Purchase.create({
      user: req.user._id, service: serviceId, amount,
      wantsNutrition: Boolean(wantsNutrition), nutritionPrice: nutriPrice,
      intake: cleanedIntake,
    });
  }

  logActivity(req.user._id, 'purchase_created', `Started purchase of "${service.name}"${wantsNutrition ? ' + nutrition' : ''}`, { serviceId: service._id, amount });
  if (cleanedIntake)
    logActivity(req.user._id, 'intake_submitted', `Answered intake questionnaire for "${service.name}"`, cleanedIntake);

  res.status(201).json({
    success: true,
    data:    { _id: purchase._id, amount: purchase.amount, service: { _id: service._id, name: service.name } },
    message: 'Purchase created — complete payment to unlock the program.',
  });
});

/* GET /api/purchases/mine — my purchases (paid ones unlock content in dashboard) */
exports.getMyPurchases = asyncHandler(async (req, res) => {
  // Only successful, still-valid payments appear — unpaid/abandoned/refunded
  // purchases are invisible (refunded ones vanish the same way refunded
  // sessions already do), and so are purchases whose 30-day renewal window
  // has fully lapsed (accessStatus 'expired') — hidden, not deleted, so
  // paying again brings them straight back.
  const purchases = await Purchase.find({ user: req.user._id, paymentStatus: 'paid', accessStatus: { $ne: 'expired' } })
    .populate('service', 'name description price imageUrl category sections trainingType isCustom')
    .sort({ paidAt: -1, createdAt: -1 });

  // Only expose full section content for PAID purchases
  const data = purchases.map(p => {
    const obj = p.toObject();
    // Custom program content stays admin-only even after purchase —
    // it's delivered personally through "My Plans"
    if (obj.service?.isCustom && obj.service?.sections) {
      obj.service.sectionsLocked = true;
      obj.service.sections = [];
    } else if (obj.paymentStatus !== 'paid' && obj.service?.sections) {
      obj.service.sectionsLocked = true;
      obj.service.sections = obj.service.sections.map(sec => ({
        _id: sec._id, heading: sec.heading, items: [], itemCount: (sec.items || []).length,
      }));
    }
    return obj;
  });

  // "Owned" predefined programs: services the user has PAID *and admin-confirmed*
  // sessions for — their full content unlocks in My Programs only once the
  // trainer has actually confirmed the booking, not just paid for it.
  const paidApptServiceIds = await Appointment.distinct('service', {
    user: req.user._id, paymentStatus: 'paid', status: 'confirmed', accessStatus: { $ne: 'expired' },
  });
  const owned = await Service.find({
    _id: { $in: paidApptServiceIds }, trainingType: 'pt',
  }).select('name description price imageUrl category sections trainingType isCustom');

  res.json({ success: true, data, owned });
});

/* GET /api/purchases — admin: ALL program sales, newest first.
   Merges two sources into one unified list:
     - Purchase docs (custom programs + instant self-training buys)
     - Appointment bookings for PREDEFINED programs, grouped by order
       (a multi-session/bundle booking is one "sale", not N rows) */
exports.getAllPurchases = asyncHandler(async (req, res) => {
  const purchases = await Purchase.find({ paymentStatus: { $in: ['paid','refunded'] } })
    .populate('user', 'name email phone')
    .populate('service', 'name price isCustom')
    .sort({ paidAt: -1, createdAt: -1 });

  const purchaseSales = purchases.map(p => ({
    _id: p._id, kind: 'purchase', user: p.user, service: p.service,
    amount: p.amount, paymentStatus: p.paymentStatus, paidAt: p.paidAt, createdAt: p.createdAt,
    wantsNutrition: p.wantsNutrition, nutritionPrice: p.nutritionPrice, intake: p.intake,
    cyberSourceTransId: p.cyberSourceTransId,
  }));

  // Predefined-program bookings: paid appointments, grouped by order (or bundle group)
  const paidAppts = await Appointment.find({ paymentStatus: { $in: ['paid','refunded'] } })
    .populate('user', 'name email phone')
    .populate('service', 'name price isCustom')
    .sort({ paidAt: -1, createdAt: -1 });

  const groups = {};
  const order = [];
  for (const a of paidAppts) {
    const key = a.cyberSourceOrderId || a.bundleGroupId || String(a._id);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(a);
  }
  const bookingSales = order.map(key => {
    const appts = groups[key];
    const first = appts[0];
    const total = appts.reduce((sum, a) => sum + Number(a.paidAmount || a.service?.price || 0)
                                          + (a.nutritionAddon ? Number(a.nutritionPrice || 0) : 0), 0);
    return {
      _id: key, kind: 'booking', user: first.user, service: first.service,
      amount: Math.round(total * 100) / 100,
      paymentStatus: first.paymentStatus, paidAt: first.paidAt, createdAt: first.createdAt,
      wantsNutrition: appts.some(a => a.nutritionAddon),
      nutritionPrice: appts.find(a => a.nutritionAddon)?.nutritionPrice || 0,
      sessions: appts.map(a => ({ date: a.date, time: a.time, mode: a.mode, status: a.status })),
      appointmentIds: appts.map(a => a._id),
      cyberSourceTransId: first.cyberSourceTransId,
    };
  });

  const all = [...purchaseSales, ...bookingSales]
    .sort((a, b) => new Date(b.paidAt || b.createdAt) - new Date(a.paidAt || a.createdAt));

  res.json({ success: true, data: all });
});

/* GET /api/purchases/admin/renewals — the admin's renewal-nudge queue:
     - upcoming: still 'active' but expiring within 2 days, and no reminder
       sent yet for this expiry cycle
     - grace: already past expiry, living on the 1-day grace period (more
       urgent — one more missed day and access disappears)
   Bundle bookings (many Appointment rows sharing a bundleGroupId) are
   collapsed to one entry per group, same grouping key used elsewhere. */
exports.getRenewals = asyncHandler(async (req, res) => {
  const now  = new Date();
  const soon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const groupBundleAppts = (appts) => {
    const groups = {};
    for (const a of appts) {
      if (!a.user) continue;
      const key = a.bundleGroupId || String(a._id);
      if (!groups[key]) groups[key] = { kind: 'booking', _id: key, user: a.user, service: a.service, expiresAt: a.expiresAt };
    }
    return Object.values(groups);
  };
  const toPurchaseEntry = (p) => ({ kind: 'purchase', _id: p._id, user: p.user, service: p.service, expiresAt: p.expiresAt });

  const [upcomingPurchases, upcomingAppts, gracePurchases, graceAppts] = await Promise.all([
    Purchase.find({ paymentStatus: 'paid', accessStatus: 'active', expiresAt: { $ne: null, $lte: soon }, renewalReminderSentAt: null })
      .populate('user', 'name email phone').populate('service', 'name'),
    Appointment.find({ paymentStatus: 'paid', isBundle: true, accessStatus: 'active', expiresAt: { $ne: null, $lte: soon }, renewalReminderSentAt: null })
      .populate('user', 'name email phone').populate('service', 'name'),
    Purchase.find({ paymentStatus: 'paid', accessStatus: 'grace' })
      .populate('user', 'name email phone').populate('service', 'name'),
    Appointment.find({ paymentStatus: 'paid', isBundle: true, accessStatus: 'grace' })
      .populate('user', 'name email phone').populate('service', 'name'),
  ]);

  const sortByExpiry = (a, b) => new Date(a.expiresAt) - new Date(b.expiresAt);
  res.json({
    success: true,
    data: {
      upcoming: [...upcomingPurchases.filter(p=>p.user).map(toPurchaseEntry), ...groupBundleAppts(upcomingAppts)].sort(sortByExpiry),
      grace:    [...gracePurchases.filter(p=>p.user).map(toPurchaseEntry),    ...groupBundleAppts(graceAppts)].sort(sortByExpiry),
    },
  });
});

/* PUT /api/purchases/admin/renewals/:kind/:id/remind — mark a reminder as
   sent so this entry drops off the "upcoming" list until it either renews
   or genuinely expires (doesn't apply to the 'grace' list — that one stays
   visible every time, it's urgent by definition). */
exports.markReminded = asyncHandler(async (req, res) => {
  const { kind, id } = req.params;
  if (kind === 'purchase') {
    const p = await Purchase.findByIdAndUpdate(id, { renewalReminderSentAt: new Date() });
    if (!p) return res.status(404).json({ success: false, message: 'Purchase not found' });
  } else if (kind === 'booking') {
    await Appointment.updateMany({ $or: [{ bundleGroupId: id }, { _id: id }] }, { renewalReminderSentAt: new Date() });
  } else {
    return res.status(400).json({ success: false, message: 'Invalid kind' });
  }
  res.json({ success: true, message: 'Marked as reminded' });
});
