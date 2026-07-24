const { WorkoutPlan, NutritionPlan, ProgressLog, User, Appointment, Purchase, Service } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');

const MAX_DAYS      = 7;
const MAX_EXERCISES = 20; // per day
const MAX_MEALS     = 10;

// ── Helpers ───────────────────────────────────────────────────
const sanitizeStr = (s, max = 500) => typeof s === 'string' ? s.trim().slice(0, max) : '';

const sanitizeExercise = (ex) => ({
  name:        sanitizeStr(ex.name, 100),
  sets:        Math.max(1, Math.min(100, Number(ex.sets) || 3)),
  reps:        sanitizeStr(ex.reps, 20),
  weight:      sanitizeStr(ex.weight, 50),
  restSeconds: Math.max(0, Math.min(3600, Number(ex.restSeconds) || 60)),
  notes:       sanitizeStr(ex.notes, 300),
  videoUrl:    (() => {
    const u = sanitizeStr(ex.videoUrl || '', 300);
    return u.startsWith('http://') || u.startsWith('https://') ? u : '';
  })(),
  order:       Number(ex.order) || 0,
});

const sanitizeWeeklyPlan = (plan) => {
  if (!Array.isArray(plan)) return [];
  return plan.slice(0, MAX_DAYS).map(day => ({
    dayName:   sanitizeStr(day.dayName, 20),
    focus:     sanitizeStr(day.focus, 100),
    notes:     sanitizeStr(day.notes, 300),
    exercises: Array.isArray(day.exercises)
      ? day.exercises.slice(0, MAX_EXERCISES).map(sanitizeExercise)
      : [],
  }));
};

const sanitizeMeals = (meals) => {
  if (!Array.isArray(meals)) return [];
  return meals.slice(0, MAX_MEALS).map(m => ({
    name:     sanitizeStr(m.name, 100),
    foods:    sanitizeStr(m.foods, 500),
    calories: m.calories != null ? Math.max(0, Math.min(9999, Number(m.calories))) : null,
    protein:  m.protein  != null ? Math.max(0, Math.min(9999, Number(m.protein)))  : null,
    carbs:    m.carbs    != null ? Math.max(0, Math.min(9999, Number(m.carbs)))    : null,
    fat:      m.fat      != null ? Math.max(0, Math.min(9999, Number(m.fat)))      : null,
  }));
};

// ── WORKOUT PLANS ─────────────────────────────────────────────

exports.getMyWorkoutPlans = asyncHandler(async (req, res) => {
  const plans = await WorkoutPlan.find({ user: req.user._id, isActive: true })
    .populate('service', 'name category imageUrl').sort({ updatedAt: -1 });

  // Plans linked to a service are gated by that service's current
  // purchase/booking access — an expired (30-day lapsed) purchase hides the
  // plan until renewed, without deleting it. General plans (service: null)
  // are always shown.
  const linkedServiceIds = plans.filter(p => p.service).map(p => p.service._id);
  const [activePurchaseServiceIds, activeApptServiceIds] = await Promise.all([
    Purchase.distinct('service', { user: req.user._id, paymentStatus: 'paid', accessStatus: { $ne: 'expired' }, service: { $in: linkedServiceIds } }),
    Appointment.distinct('service', { user: req.user._id, paymentStatus: 'paid', accessStatus: { $ne: 'expired' }, service: { $in: linkedServiceIds } }),
  ]);
  const activeServiceIds = new Set([...activePurchaseServiceIds, ...activeApptServiceIds].map(String));

  const visible = plans.filter(p => !p.service || activeServiceIds.has(String(p.service._id)));
  res.json({ success: true, data: visible });
});

exports.getWorkoutPlanById = asyncHandler(async (req, res) => {
  const plan = await WorkoutPlan.findById(req.params.id)
    .populate('service', 'name category imageUrl')
    .populate('user', 'name email');
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  if (req.user.role !== 'admin' && plan.user._id.toString() !== req.user._id.toString())
    return res.status(403).json({ success: false, message: 'Not authorized' });
  res.json({ success: true, data: plan });
});

exports.getUserWorkoutPlans = asyncHandler(async (req, res) => {
  const plans = await WorkoutPlan.find({ user: req.params.userId })
    .populate('service', 'name category imageUrl').sort({ updatedAt: -1 });
  res.json({ success: true, data: plans });
});

exports.createWorkoutPlan = asyncHandler(async (req, res) => {
  const { userId, serviceId, title, description, weeklyPlan } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const plan = await WorkoutPlan.create({
    user:        userId,
    service:     serviceId || null,
    title:       sanitizeStr(title || 'My Training Plan', 200),
    description: sanitizeStr(description || '', 1000),
    weeklyPlan:  sanitizeWeeklyPlan(weeklyPlan || []),
    createdBy:   req.user._id,
  });
  await plan.populate('service', 'name category imageUrl');
  res.status(201).json({ success: true, data: plan, message: 'Workout plan created' });
});

exports.updateWorkoutPlan = asyncHandler(async (req, res) => {
  // FIX: whitelist and sanitize fields
  const update = {};
  if (req.body.title       !== undefined) update.title       = sanitizeStr(req.body.title, 200);
  if (req.body.description !== undefined) update.description = sanitizeStr(req.body.description, 1000);
  if (req.body.weeklyPlan  !== undefined) update.weeklyPlan  = sanitizeWeeklyPlan(req.body.weeklyPlan);
  if (req.body.isActive    !== undefined) update.isActive    = Boolean(req.body.isActive);
  if (req.body.service     !== undefined) update.service     = req.body.service || null;

  const plan = await WorkoutPlan.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true })
    .populate('service', 'name category imageUrl');
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
  res.json({ success: true, data: plan, message: 'Plan updated' });
});

exports.deleteWorkoutPlan = asyncHandler(async (req, res) => {
  await WorkoutPlan.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true, message: 'Plan removed' });
});

// ── NUTRITION PLANS ───────────────────────────────────────────

exports.getMyNutrition = asyncHandler(async (req, res) => {
  const plan = await NutritionPlan.findOne({ user: req.user._id });
  if (!plan) return res.json({ success: true, data: null });

  // Nutrition is a single per-user doc, not per-purchase — visible as long
  // as ANY of the user's nutrition-including purchases/bookings hasn't
  // expired (same "any other active source" check cleanupAfterRefund uses).
  const [activePurchase, activeAppt] = await Promise.all([
    Purchase.findOne({ user: req.user._id, paymentStatus: 'paid', wantsNutrition: true, accessStatus: { $ne: 'expired' } }),
    Appointment.findOne({ user: req.user._id, paymentStatus: 'paid', nutritionAddon: true, accessStatus: { $ne: 'expired' } }),
  ]);
  if (!activePurchase && !activeAppt) return res.json({ success: true, data: null });

  res.json({ success: true, data: plan });
});

exports.getUserNutrition = asyncHandler(async (req, res) => {
  const plan = await NutritionPlan.findOne({ user: req.params.userId });
  res.json({ success: true, data: plan || null });
});

exports.upsertNutrition = asyncHandler(async (req, res) => {
  const userId = req.params.userId || req.user._id;
  const { title, goal, dailyCalories, dailyProtein, dailyCarbs, dailyFat, meals, guidelines, supplements } = req.body;

  // FIX: sanitize and validate all nutrition fields
  const safeCalories = dailyCalories != null ? Math.max(0, Math.min(99999, Number(dailyCalories))) : null;
  const safeProtein  = dailyProtein  != null ? Math.max(0, Math.min(9999,  Number(dailyProtein)))  : null;
  const safeCarbs    = dailyCarbs    != null ? Math.max(0, Math.min(9999,  Number(dailyCarbs)))    : null;
  const safeFat      = dailyFat      != null ? Math.max(0, Math.min(9999,  Number(dailyFat)))      : null;

  const plan = await NutritionPlan.findOneAndUpdate(
    { user: userId },
    {
      title:         sanitizeStr(title || 'My Nutrition Plan', 200),
      goal:          sanitizeStr(goal  || '', 300),
      dailyCalories: safeCalories, dailyProtein: safeProtein,
      dailyCarbs:    safeCarbs,    dailyFat:     safeFat,
      meals:         sanitizeMeals(meals || []),
      guidelines:    sanitizeStr(guidelines  || '', 2000),
      supplements:   sanitizeStr(supplements || '', 1000),
      updatedBy:     req.user._id,
    },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: plan, message: 'Nutrition plan saved' });
});

// ── PROGRESS LOGS ─────────────────────────────────────────────

exports.getMyProgress = asyncHandler(async (req, res) => {
  const type  = req.query.type;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 60));
  const filter = { user: req.user._id };
  if (type && ['workout','body'].includes(type)) filter.type = type;
  const logs = await ProgressLog.find(filter).sort({ date: -1 }).limit(limit);
  res.json({ success: true, data: logs });
});

exports.logProgress = asyncHandler(async (req, res) => {
  const { date, type, sessionTitle, durationMins, energyLevel,
          bodyWeight, bodyFat, chestCm, waistCm, hipsCm, armCm, thighCm, notes } = req.body;
  if (!date || !type) return res.status(400).json({ success: false, message: 'date and type are required' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: 'Invalid date format' });
  if (!['workout','body'].includes(type)) return res.status(400).json({ success: false, message: 'type must be workout or body' });

  // FIX: sanitize and clamp all numeric fields
  const clamp = (v, min, max) => v != null && !isNaN(Number(v)) ? Math.max(min, Math.min(max, Number(v))) : null;

  const log = await ProgressLog.create({
    user: req.user._id, date, type,
    sessionTitle: sanitizeStr(sessionTitle || '', 200),
    durationMins: clamp(durationMins, 0, 600),
    energyLevel:  clamp(energyLevel,  1, 5) || 3,
    bodyWeight:   clamp(bodyWeight,   0, 999),
    bodyFat:      clamp(bodyFat,      0, 100),
    chestCm:      clamp(chestCm,      0, 999),
    waistCm:      clamp(waistCm,      0, 999),
    hipsCm:       clamp(hipsCm,       0, 999),
    armCm:        clamp(armCm,        0, 999),
    thighCm:      clamp(thighCm,      0, 999),
    notes:        sanitizeStr(notes || '', 1000),
  });
  res.status(201).json({ success: true, data: log, message: 'Progress logged' });
});

exports.deleteProgressLog = asyncHandler(async (req, res) => {
  const log = await ProgressLog.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!log) return res.status(404).json({ success: false, message: 'Log not found' });
  res.json({ success: true, message: 'Log deleted' });
});

exports.getUserProgress = asyncHandler(async (req, res) => {
  const type  = req.query.type;
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 60));
  const filter = { user: req.params.userId };
  if (type && ['workout','body'].includes(type)) filter.type = type;
  const logs = await ProgressLog.find(filter).sort({ date: -1 }).limit(limit);
  res.json({ success: true, data: logs });
});


/* GET /api/workout/admin/nutrition-pending — users who PAID for a nutrition
   plan (booking add-on or program purchase) and don't have one yet.
   This is the admin's build queue: only paying customers appear here. */
exports.getNutritionPending = asyncHandler(async (req, res) => {
  const [apptUsers, purchaseUsers, planned] = await Promise.all([
    Appointment.distinct('user', { paymentStatus: 'paid', nutritionAddon: true, user: { $ne: null } }),
    Purchase.distinct('user',    { paymentStatus: 'paid', wantsNutrition: true }),
    NutritionPlan.distinct('user'),
  ]);
  const plannedSet = new Set(planned.map(String));
  const pendingIds = [...new Set([...apptUsers, ...purchaseUsers].map(String))]
    .filter(id => !plannedSet.has(id));
  const users = await User.find({ _id: { $in: pendingIds } })
    .select('name email phone createdAt');
  res.json({ success: true, data: users });
});

/* GET /api/workout/admin/eligible-users — users who are actually relevant to
   the Workout Plans admin screen: they paid for a custom program or
   nutrition, OR already have a plan built. Everyone else (never bought
   anything) is filtered out of the client picker. */
exports.getEligibleUsers = asyncHandler(async (req, res) => {
  // 'self' trainingType IS the custom-program flow throughout this app
  // (labeled "Custom Program" everywhere) — query it directly rather than
  // via the isCustom flag, which can drift out of sync on older records.
  const customServiceIds = await Service.distinct('_id', { trainingType: 'self' });
  const [customBuyers, nutritionBuyers, nutritionAddonAppts, planUsers, nutriPlanUsers] = await Promise.all([
    Purchase.distinct('user', { paymentStatus: 'paid', service: { $in: customServiceIds } }),
    Purchase.distinct('user', { paymentStatus: 'paid', wantsNutrition: true }),
    Appointment.distinct('user', { paymentStatus: 'paid', nutritionAddon: true, user: { $ne: null } }),
    WorkoutPlan.distinct('user'),
    NutritionPlan.distinct('user'),
  ]);
  const ids = [...new Set(
    [...customBuyers, ...nutritionBuyers, ...nutritionAddonAppts, ...planUsers, ...nutriPlanUsers].map(String)
  )];
  res.json({ success: true, data: ids });
});

/* GET /api/workout/admin/custom-pending — users who PAID for a custom
   program and don't have a WorkoutPlan built for that program yet.
   Mirrors getNutritionPending so custom-program builds get the same
   admin review queue as nutrition builds. */
exports.getCustomPending = asyncHandler(async (req, res) => {
  // See getEligibleUsers — query trainingType directly for the same reason.
  const customServiceIds = await Service.distinct('_id', { trainingType: 'self' });
  const purchases = await Purchase.find({
    paymentStatus: 'paid', service: { $in: customServiceIds },
  }).select('user service').populate('user', 'name email phone createdAt');

  const builtPairs = new Set(
    (await WorkoutPlan.find({ service: { $in: customServiceIds } }).select('user service'))
      .map(p => `${p.user}:${p.service}`)
  );

  const seen = new Set();
  const pending = [];
  for (const p of purchases) {
    if (!p.user) continue;
    const key = `${p.user._id}:${p.service}`;
    if (builtPairs.has(key) || seen.has(key)) continue;
    seen.add(key);
    pending.push(p.user);
  }
  res.json({ success: true, data: pending });
});
