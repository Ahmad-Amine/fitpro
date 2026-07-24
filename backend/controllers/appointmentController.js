const { Appointment, Service, Bundle, ShopSettings } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { logActivity }  = require('../utils/activityLog');
const { refundAppointmentCore } = require('./paymentController');
const crypto = require('crypto');

const MAX_SLOTS_PER_BOOKING = 20; // FIX: cap multi-slot bookings

const populateAppt = (q) =>
  q.populate('service', 'name price duration category imageUrl')
   .populate('user', 'name email phone')
   .populate('bundleId', 'name sessions price');

exports.getMyAppointments = asyncHandler(async (req, res) => {
  // Every status (pending/confirmed/rejected/cancelled) is shown, including
  // past dates — only unpaid/abandoned bookings are hidden. 'refunded' is
  // included alongside 'paid' because rejecting an online-paid session
  // triggers an automatic refund, which flips paymentStatus away from 'paid'.
  const appts = await Appointment.find({ user: req.user._id, paymentStatus: { $in: ['paid', 'refunded'] }, accessStatus: { $ne: 'expired' } })
    .populate('service', 'name price duration category imageUrl')
    .populate('bundleId', 'name sessions price')
    .sort({ date: -1, time: -1 });
  res.json({ success: true, data: appts });
});

exports.getAllAppointments = asyncHandler(async (req, res) => {
  // Newest on top for the admin view.
  // Only bookings with successful payment (or admin-made phone bookings) appear —
  // abandoned/unpaid checkout attempts are hidden. 'refunded' is included
  // alongside 'paid' because rejecting an online-paid session triggers an
  // automatic refund, which flips paymentStatus away from 'paid' — without
  // this the rejected session would vanish from the admin view on refresh.
  const appts = await populateAppt(
    Appointment.find({ $or: [ { paymentStatus: { $in: ['paid', 'refunded'] } }, { isPhoneBooking: true } ] })
  ).sort({ date: -1, time: -1, createdAt: -1 });
  res.json({ success: true, data: appts });
});

exports.getRevenueSummary = asyncHandler(async (req, res) => {
  const confirmed    = await Appointment.find({ status: 'confirmed' }).populate('service', 'price');
  const totalRevenue = confirmed.reduce((s, a) => s + (a.paidAmount || a.service?.price || 0), 0);
  const paidCount    = confirmed.filter(a => a.isPaid).length;
  const unpaidCount  = confirmed.filter(a => !a.isPaid).length;
  const todayStr     = new Date().toISOString().split('T')[0];
  const todayAppts   = await Appointment.find({ date: todayStr }).populate('service', 'price');
  const todayRevenue = todayAppts.filter(a => a.status === 'confirmed' && a.isPaid)
    .reduce((s, a) => s + (a.paidAmount || a.service?.price || 0), 0);
  res.json({ success: true, data: { totalRevenue, paidCount, unpaidCount, todayRevenue, todayAppts: todayAppts.length } });
});

// Single appointment
const MAX_UNPAID_APPOINTMENTS = 5;

exports.createAppointment = asyncHandler(async (req, res) => {
  const { date, time, notes } = req.body;
  const mode = req.body.mode === 'online' ? 'online' : 'live';
  const wantsNutrition = Boolean(req.body.wantsNutrition);
  if (!date || !time)
    return res.status(400).json({ success: false, message: 'Date and time are required' });
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return res.status(400).json({ success: false, message: 'Invalid date format (YYYY-MM-DD)' });
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time))
    return res.status(400).json({ success: false, message: 'Invalid time format (HH:MM)' });

  const now = new Date(), todayStr = now.toISOString().split('T')[0];
  if (date < todayStr) return res.status(400).json({ success: false, message: 'Cannot book in the past' });
  if (date === todayStr && new Date(`${date}T${time}:00`) <= now)
    return res.status(400).json({ success: false, message: 'This time slot has already passed' });

  const conflict = await Appointment.findOne({ date, time, status: { $in: ['pending','confirmed'] } });
  if (conflict) return res.status(409).json({ success: false, message: 'This slot is already booked.' });

  // Anti-abuse: block piling up unpaid bookings — payment is required to hold slots
  const unpaidCount = await Appointment.countDocuments({ user: req.user._id, paymentStatus: { $in: ['unpaid','pending','failed'] }, status: { $ne: 'cancelled' } });
  if (unpaidCount >= MAX_UNPAID_APPOINTMENTS)
    return res.status(403).json({ success: false, message: 'You have unpaid bookings. Please complete payment before booking more sessions.' });

  const notes_clean = typeof notes === 'string' ? notes.slice(0, 500) : '';
  const st = await ShopSettings.findOne({ singleton: 'main' });
  const price = mode === 'online' ? Number(st?.sessionPriceOnline || 0) : Number(st?.sessionPriceLive || 0);
  // Nutrition add-on: snapshot the admin-set price on the appointment
  const nutriPrice = wantsNutrition ? Number(st?.nutritionPrice || 0) : 0;
  const appt = await Appointment.create({
    user: req.user._id, mode, date, time, notes: notes_clean,
    paidAmount: price,
    nutritionAddon: wantsNutrition, nutritionPrice: nutriPrice,
  });
  logActivity(req.user._id, 'appointment_booked', `Booked a session on ${date} ${time}`, { appointmentId: appt._id });
  res.status(201).json({ success: true, data: [appt], message: 'Session booked! Awaiting confirmation.' });
});

// Multi-date booking with optional bundle
exports.createMultiAppointment = asyncHandler(async (req, res) => {
  const { slots, notes, bundleId } = req.body;
  const wantsNutrition = Boolean(req.body.wantsNutrition);
  // Fallback mode if a slot doesn't carry its own (legacy clients)
  const defaultMode = req.body.mode === 'online' ? 'online' : 'live';
  const slotMode = (slot) => (slot.mode === 'online' ? 'online' : slot.mode === 'live' ? 'live' : defaultMode);
  if (!slots || !Array.isArray(slots) || slots.length === 0)
    return res.status(400).json({ success: false, message: 'At least one slot is required' });

  // FIX: cap number of slots to prevent abuse
  if (slots.length > MAX_SLOTS_PER_BOOKING)
    return res.status(400).json({ success: false, message: `Maximum ${MAX_SLOTS_PER_BOOKING} sessions per booking` });

  const unpaidCount = await Appointment.countDocuments({ user: req.user._id, paymentStatus: { $in: ['unpaid','pending','failed'] }, status: { $ne: 'cancelled' } });
  if (unpaidCount >= MAX_UNPAID_APPOINTMENTS)
    return res.status(403).json({ success: false, message: 'You have unpaid bookings. Please complete payment before booking more sessions.' });

  let bundle = null;
  if (bundleId) {
    bundle = await Bundle.findById(bundleId);
    if (!bundle || !bundle.isActive)
      return res.status(400).json({ success: false, message: 'Bundle not found or inactive' });
    if (slots.length > bundle.sessions)
      return res.status(400).json({ success: false, message: `Bundle covers ${bundle.sessions} sessions maximum` });
  }

  const now = new Date(), todayStr = now.toISOString().split('T')[0];
  const bundleGroupId = crypto.randomUUID();

  // Validate all slots
  for (const slot of slots) {
    if (!slot.date || !slot.time) return res.status(400).json({ success: false, message: 'Each slot needs date and time' });
    // FIX: strict format validation
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.date)) return res.status(400).json({ success: false, message: 'Invalid date format' });
    if (!/^\d{2}:\d{2}$/.test(slot.time)) return res.status(400).json({ success: false, message: 'Invalid time format' });
    if (slot.date < todayStr) return res.status(400).json({ success: false, message: `Date ${slot.date} is in the past` });
    const conflict = await Appointment.findOne({ date: slot.date, time: slot.time, status: { $in: ['pending','confirmed'] } });
    if (conflict) return res.status(409).json({ success: false, message: `Slot ${slot.date} at ${slot.time} is already booked` });
  }

  // Check for duplicate dates within the request itself
  const dateTimeSet = new Set(slots.map(s => `${s.date}T${s.time}`));
  if (dateTimeSet.size !== slots.length)
    return res.status(400).json({ success: false, message: 'Duplicate date/time slots in your booking' });

  // Bundles: fixed per-session price. Otherwise each slot is priced by ITS OWN
  // mode (live/online) — one order can mix both.
  const st = await ShopSettings.findOne({ singleton: 'main' });
  const priceFor = (mode) => mode === 'online' ? Number(st?.sessionPriceOnline || 0) : Number(st?.sessionPriceLive || 0);
  const bundlePerSession = bundle ? parseFloat((bundle.price / bundle.sessions).toFixed(2)) : null;
  const nutriPrice = wantsNutrition ? Number(st?.nutritionPrice || 0) : 0;

  const notes_clean = typeof notes === 'string' ? notes.slice(0, 500) : '';

  const appts = await Promise.all(slots.map((slot, idx) =>
    Appointment.create({
      user: req.user._id, mode: slotMode(slot),
      date: slot.date, time: slot.time,
      notes: notes_clean,
      paidAmount: bundle ? bundlePerSession : priceFor(slotMode(slot)),
      bundleId: bundle?._id || null,
      bundleGroupId: slots.length > 1 ? bundleGroupId : '',
      isBundle: !!bundle,
      // Nutrition add-on lives on the FIRST appointment of the order only
      nutritionAddon: wantsNutrition && idx === 0,
      nutritionPrice: (wantsNutrition && idx === 0) ? nutriPrice : 0,
    })
  ));

  const populated = await Promise.all(appts.map(a =>
    Appointment.findById(a._id).populate('bundleId', 'name sessions price')
  ));

  const totalPrice = (bundle
    ? bundle.price
    : slots.reduce((sum, slot) => sum + priceFor(slotMode(slot)), 0)
  ) + nutriPrice;
  logActivity(req.user._id, 'appointment_booked', `Booked ${slots.length} session(s)${bundle ? ` (bundle: ${bundle.name})` : ''}`, { bundleGroupId });
  res.status(201).json({
    success: true, data: populated, totalPrice, isBundle: !!bundle,
    message: `${slots.length} session(s) booked!${bundle ? ` Bundle: ${bundle.name}` : ''} Awaiting confirmation.`
  });
});

exports.createPhoneBooking = asyncHandler(async (req, res) => {
  const { customerName, customerPhone, serviceId, date, time, notes } = req.body;
  if (!customerName || !customerPhone || !serviceId || !date || !time)
    return res.status(400).json({ success: false, message: 'All fields are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: 'Invalid date format' });
  if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ success: false, message: 'Invalid time format' });
  if (String(customerName).length > 100) return res.status(400).json({ success: false, message: 'Name too long' });
  if (String(customerPhone).length > 30) return res.status(400).json({ success: false, message: 'Phone too long' });

  const conflict = await Appointment.findOne({ date, time, status: { $in: ['pending','confirmed'] } });
  if (conflict) return res.status(409).json({ success: false, message: 'This slot is already booked.' });

  const service = await Service.findById(serviceId);
  if (!service || !service.isActive) return res.status(404).json({ success: false, message: 'Service not found' });

  const notes_clean = typeof notes === 'string' ? notes.slice(0, 500) : '';
  const appt = await Appointment.create({ customerName: String(customerName).trim(), customerPhone: String(customerPhone).trim(), service: serviceId, date, time, notes: notes_clean, isPhoneBooking: true, status: 'confirmed', paidAmount: service.price });
  await appt.populate('service', 'name price duration category');
  res.status(201).json({ success: true, data: appt, message: 'Phone booking created and confirmed.' });
});

exports.cancelAppointment = asyncHandler(async (req, res) => {
  const appt = await Appointment.findOne({ _id: req.params.id, user: req.user._id });
  if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (appt.status === 'cancelled') return res.status(400).json({ success: false, message: 'Already cancelled' });
  if (appt.isPaid && appt.paymentMethod === 'online')
    return res.status(400).json({ success: false, message: 'Cannot cancel a paid session. Please contact your trainer for a refund.' });
  appt.status = 'cancelled'; await appt.save();
  res.json({ success: true, message: 'Session cancelled', data: appt });
});

exports.confirmAppointment = asyncHandler(async (req, res) => {
  const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.slice(0, 500) : '';
  const appt = await populateAppt(Appointment.findByIdAndUpdate(req.params.id, { status: 'confirmed', adminNote }, { new: true }));
  if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (appt.user) logActivity(appt.user._id, 'appointment_confirmed', `Session for "${appt.service?.name}" on ${appt.date} ${appt.time} was confirmed`, { appointmentId: appt._id });
  res.json({ success: true, data: appt, message: 'Session confirmed' });
});

exports.rejectAppointment = asyncHandler(async (req, res) => {
  const adminNote = typeof req.body.adminNote === 'string' ? req.body.adminNote.slice(0, 500) : '';
  const rawAppt = await Appointment.findByIdAndUpdate(req.params.id, { status: 'rejected', adminNote }, { new: true });
  if (!rawAppt) return res.status(404).json({ success: false, message: 'Appointment not found' });

  // Rejecting a session that was already paid online triggers an automatic
  // refund — the admin shouldn't have to remember a separate manual step.
  // Must run against the RAW (unpopulated) doc — refundAppointmentCore
  // queries by appt.user/appt.service as plain ObjectIds.
  let refunded = false;
  if (rawAppt.isPaid && rawAppt.paymentMethod === 'online' && rawAppt.cyberSourceTransId) {
    try {
      const result = await refundAppointmentCore(rawAppt);
      refunded = result.refunded;
    } catch (err) {
      console.error('[reject] auto-refund failed:', err?.response?.data || err.message);
    }
  }

  const appt = await populateAppt(Appointment.findById(rawAppt._id));
  if (appt.user) logActivity(appt.user._id, 'appointment_rejected', `Session for "${appt.service?.name}" on ${appt.date} ${appt.time} was rejected`, { appointmentId: appt._id });

  res.json({
    success: true, data: appt,
    message: refunded ? 'Session rejected and refunded' : 'Session rejected',
  });
});

// FIX: validate paidAmount range
exports.markPaid = asyncHandler(async (req, res) => {
  const { paidAmount, paymentNote } = req.body;
  let updateFields = { isPaid: true };

  if (paidAmount !== undefined) {
    const amt = Number(paidAmount);
    if (isNaN(amt) || amt < 0 || amt > 100000)
      return res.status(400).json({ success: false, message: 'Invalid payment amount (0–100,000)' });
    updateFields.paidAmount = amt;
  }
  if (paymentNote) updateFields.paymentNote = String(paymentNote).slice(0, 500);

  const appt = await populateAppt(Appointment.findByIdAndUpdate(req.params.id, updateFields, { new: true }));
  if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found' });
  res.json({ success: true, data: appt, message: 'Marked as paid' });
});

exports.cleanupOldAppointments = asyncHandler(async (req, res) => {
  const deleted = await Appointment.removeOldAppointments();
  res.json({ success: true, message: `Removed ${deleted} appointment(s) older than 2 weeks` });
});

// ── BUNDLES ───────────────────────────────────────────────────
exports.getBundles = asyncHandler(async (req, res) => {
  const bundles = await Bundle.find({ isActive: true }).populate('service', 'name category');
  res.json({ success: true, data: bundles });
});

exports.createBundle = asyncHandler(async (req, res) => {
  const { name, description, sessions, price, validDays, service } = req.body;
  if (!name || !sessions || !price) return res.status(400).json({ success: false, message: 'Name, sessions and price required' });
  const sessionsNum = Number(sessions), priceNum = Number(price), daysNum = Number(validDays) || 30;
  if (isNaN(sessionsNum) || sessionsNum < 1 || sessionsNum > 100) return res.status(400).json({ success: false, message: 'Sessions must be 1–100' });
  if (isNaN(priceNum) || priceNum < 0 || priceNum > 100000) return res.status(400).json({ success: false, message: 'Invalid price' });
  if (String(name).length > 100) return res.status(400).json({ success: false, message: 'Name too long' });
  const bundle = await Bundle.create({ name: String(name).trim(), description: description ? String(description).slice(0,500) : '', sessions: sessionsNum, price: priceNum, validDays: daysNum, service: service || null });
  res.status(201).json({ success: true, data: bundle, message: 'Bundle created' });
});

// FIX: whitelist bundle update fields
exports.updateBundle = asyncHandler(async (req, res) => {
  const { name, description, sessions, price, validDays, service } = req.body;
  const update = {};
  if (name !== undefined)        { if (String(name).length > 100) return res.status(400).json({success:false,message:'Name too long'}); update.name = String(name).trim(); }
  if (description !== undefined) update.description = String(description).slice(0, 500);
  if (sessions !== undefined)    { const s = Number(sessions); if (isNaN(s)||s<1||s>100) return res.status(400).json({success:false,message:'Sessions 1–100'}); update.sessions = s; }
  if (price !== undefined)       { const p = Number(price); if (isNaN(p)||p<0||p>100000) return res.status(400).json({success:false,message:'Invalid price'}); update.price = p; }
  if (validDays !== undefined)   { update.validDays = Math.max(1, Math.min(365, Number(validDays)||30)); }
  if (service !== undefined)     update.service = service || null;

  const bundle = await Bundle.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!bundle) return res.status(404).json({ success: false, message: 'Bundle not found' });
  res.json({ success: true, data: bundle, message: 'Bundle updated' });
});

exports.deleteBundle = asyncHandler(async (req, res) => {
  await Bundle.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true, message: 'Bundle removed' });
});
