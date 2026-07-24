const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ── USER ──────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  phone:    { type: String, required: true, trim: true },
  role:     { type: String, enum: ['customer','admin'], default: 'customer' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
userSchema.methods.matchPassword = function(plain) { return bcrypt.compare(plain, this.password); };

// ── SERVICE ───────────────────────────────────────────────────
const sectionItemSchema = new mongoose.Schema({
  title:       { type: String, default: '', trim: true },
  description: { type: String, default: '', trim: true },
  imageUrl:    { type: String, default: '', trim: true },
}, { _id: true });

const serviceSectionSchema = new mongoose.Schema({
  heading: { type: String, required: true, trim: true },
  items:   [sectionItemSchema],
}, { _id: true });

const serviceSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, required: true },
  price:       { type: Number, required: true, min: 0 },
  duration:    { type: Number, required: true, min: 1 },
  category:    { type: String, enum: ['Strength','Cardio','Flexibility','Combat','Wellness','Nutrition','Other'], default: 'Other' },
  imageUrl:    { type: String, default: '' },
  isActive:    { type: Boolean, default: true },
  sections:    [serviceSectionSchema],
  // Training type: 'pt' = train with personal trainer (calendar bookings, live/online),
  //                'self' = self-training program (one-time purchase, no calendar)
  trainingType: { type: String, enum: ['pt','self'], default: 'pt', index: true },
  // Custom programs: content is built per-user by the admin in "My Plans".
  // Their sections are NEVER shown to users (admin only) — after purchase the
  // user waits for the trainer to create their personalized plan.
  isCustom:     { type: Boolean, default: false },
  // PT-only pricing per session mode (falls back to `price` when null)
  priceLive:    { type: Number, default: null, min: 0 },
  priceOnline:  { type: Number, default: null, min: 0 },
  // keep old fields so existing data isn't broken
  highlights:  [{ type: String, trim: true }],
  foodItems:   [{ type: mongoose.Schema.Types.Mixed }],
}, { timestamps: true });

// ── BUNDLE ────────────────────────────────────────────────────
const bundleSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  sessions:    { type: Number, required: true, min: 1 },
  price:       { type: Number, required: true, min: 0 },
  validDays:   { type: Number, default: 30 },
  service:     { type: mongoose.Schema.Types.ObjectId, ref: 'Service', default: null },
  isActive:    { type: Boolean, default: true },
}, { timestamps: true });

// ── APPOINTMENT ───────────────────────────────────────────────
const appointmentSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref:'User', default: null, index: true },
  customerName:   { type: String, default: '' },
  customerPhone:  { type: String, default: '' },
  isPhoneBooking: { type: Boolean, default: false },
  // Optional: user-booked appointments are now generic "meet with trainer"
  // slots priced from ShopSettings, unrelated to any specific program —
  // only phone bookings (admin-created) still link to a chosen service.
  service:        { type: mongoose.Schema.Types.ObjectId, ref:'Service', default: null, index: true },
  // PT session mode — determines which price applies (priceLive / priceOnline)
  mode:           { type: String, enum: ['live','online'], default: 'live' },
  // Nutrition add-on (stored once, on the first appointment of an order)
  nutritionAddon: { type: Boolean, default: false },
  nutritionPrice: { type: Number, default: 0 },
  date:           { type: String, required: true, index: true },
  time:           { type: String, required: true },
  status:         { type: String, enum: ['pending','confirmed','rejected','cancelled'], default: 'pending', index: true },
  notes:          { type: String, default: '' },
  adminNote:      { type: String, default: '' },
  isPaid:              { type: Boolean, default: false },
  paidAmount:          { type: Number, default: 0, min: 0 },
  paymentNote:         { type: String, default: '' },
  paymentStatus:       { type: String, enum: ['unpaid','pending','capturing','paid','failed','refunded'], default: 'unpaid' },
  paymentMethod:       { type: String, enum: ['cash','online','none'], default: 'none' },
  cyberSourceTransId:  { type: String, default: '' },
  cyberSourceOrderId:  { type: String, default: '' },
  paidAt:              { type: Date, default: null },
  bundleId:            { type: mongoose.Schema.Types.ObjectId, ref:'Bundle', default: null },
  bundleGroupId:       { type: String, default: '' },
  isBundle:            { type: Boolean, default: false },
  // Renewal tracking (bundle bookings only — a one-off dated session isn't
  // a subscription and is left with these at their defaults forever).
  expiresAt:             { type: Date, default: null },
  accessStatus:          { type: String, enum: ['active','grace','expired'], default: 'active' },
  renewalReminderSentAt: { type: Date, default: null },
}, { timestamps: true });
appointmentSchema.index({ date: 1, time: 1, status: 1 });
appointmentSchema.statics.removeOldAppointments = async function() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Rejected sessions get a longer grace period so the admin can still see
  // them (and their refund state) for a full month after the rejection —
  // measured from when the doc was last updated (i.e. the reject action),
  // not the original session date.
  const rejectedCutoff = new Date();
  rejectedCutoff.setDate(rejectedCutoff.getDate() - 30);

  const result = await this.deleteMany({
    $or: [
      { date: { $lt: cutoffStr }, status: { $ne: 'rejected' } },
      { date: { $lt: cutoffStr }, status: 'rejected', updatedAt: { $lt: rejectedCutoff } },
    ],
  });
  if (result.deletedCount > 0) console.log(`🧹 Removed ${result.deletedCount} old appointment(s)`);
  return result.deletedCount;
};

// ── WORKING HOURS ─────────────────────────────────────────────
const workingHoursSchema = new mongoose.Schema({
  dayOfWeek:    { type: Number, required: true, unique: true, min: 0, max: 6 },
  isOpen:       { type: Boolean, default: true },
  openTime:     { type: String, default: '06:00' },
  closeTime:    { type: String, default: '21:00' },
  slotDuration: { type: Number, default: 60, min: 15 },
}, { timestamps: true });

// ── DATE OVERRIDE ─────────────────────────────────────────────
const dateOverrideSchema = new mongoose.Schema({
  date:         { type: String, required: true, unique: true },
  isOpen:       { type: Boolean, required: true },
  openTime:     { type: String, default: '06:00' },
  closeTime:    { type: String, default: '21:00' },
  slotDuration: { type: Number, default: 60 },
  reason:       { type: String, default: '' },
}, { timestamps: true });

// ── WORKOUT PLAN ──────────────────────────────────────────────
const exerciseSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  sets:        { type: Number, default: 3 },
  reps:        { type: String, default: '10' },
  weight:      { type: String, default: '' },
  restSeconds: { type: Number, default: 60 },
  notes:       { type: String, default: '' },
  videoUrl:    { type: String, default: '' },
  order:       { type: Number, default: 0 },
}, { _id: true });

const dayPlanSchema = new mongoose.Schema({
  dayName:   { type: String, required: true },
  focus:     { type: String, default: '' },
  exercises: [exerciseSchema],
  notes:     { type: String, default: '' },
}, { _id: true });

const workoutPlanSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref:'User', required: true, index: true },
  service:     { type: mongoose.Schema.Types.ObjectId, ref:'Service', default: null },
  title:       { type: String, default: 'My Training Plan' },
  description: { type: String, default: '' },
  weeklyPlan:  [dayPlanSchema],
  isActive:    { type: Boolean, default: true },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref:'User' },
}, { timestamps: true });

// ── PROGRESS LOG ──────────────────────────────────────────────
const setLogSchema = new mongoose.Schema({
  exerciseName: { type: String },
  setNumber:    { type: Number },
  reps:         { type: Number },
  weight:       { type: Number },
  notes:        { type: String, default: '' },
}, { _id: false });

const progressLogSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref:'User', required: true, index: true },
  date:         { type: String, required: true },
  type:         { type: String, enum: ['workout','body'], required: true },
  sessionTitle: { type: String, default: '' },
  exerciseLogs: [setLogSchema],
  durationMins: { type: Number, default: 0 },
  energyLevel:  { type: Number, min: 1, max: 5, default: 3 },
  bodyWeight:   { type: Number, default: null },
  bodyFat:      { type: Number, default: null },
  chestCm:      { type: Number, default: null },
  waistCm:      { type: Number, default: null },
  hipsCm:       { type: Number, default: null },
  armCm:        { type: Number, default: null },
  thighCm:      { type: Number, default: null },
  notes:        { type: String, default: '' },
}, { timestamps: true });
progressLogSchema.index({ user: 1, date: -1, type: 1 });

// ── NUTRITION PLAN ────────────────────────────────────────────
const mealSchema = new mongoose.Schema({
  name:     { type: String },
  foods:    { type: String },
  calories: { type: Number, default: null },
  protein:  { type: Number, default: null },
  carbs:    { type: Number, default: null },
  fat:      { type: Number, default: null },
}, { _id: true });

const nutritionPlanSchema = new mongoose.Schema({
  user:          { type: mongoose.Schema.Types.ObjectId, ref:'User', required: true, unique: true, index: true },
  title:         { type: String, default: 'My Nutrition Plan' },
  goal:          { type: String, default: '' },
  dailyCalories: { type: Number, default: null },
  dailyProtein:  { type: Number, default: null },
  dailyCarbs:    { type: Number, default: null },
  dailyFat:      { type: Number, default: null },
  meals:         [mealSchema],
  guidelines:    { type: String, default: '' },
  supplements:   { type: String, default: '' },
  updatedBy:     { type: mongoose.Schema.Types.ObjectId, ref:'User' },
}, { timestamps: true });

// ── SHOP SETTINGS ─────────────────────────────────────────────
const shopSettingsSchema = new mongoose.Schema({
  singleton:     { type: String, default: 'main', unique: true },
  shopName:      { type: String, default: 'FitPro Training' },
  // Global add-on price for a personalized nutrition plan (admin-set)
  nutritionPrice:{ type: Number, default: 0, min: 0 },
  // Global default prices for a generic appointment (no program attached)
  sessionPriceLive:   { type: Number, default: 0, min: 0 },
  sessionPriceOnline: { type: Number, default: 0, min: 0 },
  tagline:       { type: String, default: 'Transform Your Body, Transform Your Life' },
  address:       { type: String, default: 'Your City, Country' },
  googleMapsUrl: { type: String, default: '' },
  email:         { type: String, default: '' },
  hoursWeekdays: { type: String, default: 'Mon–Fri: 6 AM – 9 PM' },
  hoursSaturday: { type: String, default: 'Saturday: 7 AM – 5 PM' },
  hoursSunday:   { type: String, default: 'Sunday: Closed' },
  phone:         { type: String, default: '' },
  whatsapp:      { type: String, default: '' },
  facebook:      { type: String, default: '' },
  instagram:     { type: String, default: '' },
  tiktok:        { type: String, default: '' },
  heroTitle:     { type: String, default: 'Transform Your Body' },
  heroSubtitle:  { type: String, default: "Expert personal training tailored to your goals. Whether you want to lose weight, build muscle, or improve your fitness — I'm here to guide you every step of the way." },
  stat1Value:    { type: String, default: '500+' },
  stat1Label:    { type: String, default: 'Clients Trained' },
  stat2Value:    { type: String, default: '8+' },
  stat2Label:    { type: String, default: 'Years Experience' },
  stat3Value:    { type: String, default: '98%' },
  stat3Label:    { type: String, default: 'Success Rate' },
  stat4Value:    { type: String, default: '50+' },
  stat4Label:    { type: String, default: 'Programs' },
  feature1Title: { type: String, default: 'Personalized Plans' },
  feature1Desc:  { type: String, default: 'Every program is tailored specifically to your body, goals and fitness level.' },
  feature2Title: { type: String, default: 'Expert Guidance' },
  feature2Desc:  { type: String, default: 'Certified trainer with years of experience in strength and conditioning.' },
  feature3Title: { type: String, default: 'Flexible Schedule' },
  feature3Desc:  { type: String, default: 'Book sessions at times that work for you, 6 days a week.' },
  feature4Title: { type: String, default: 'Proven Results' },
  feature4Desc:  { type: String, default: 'Join hundreds of clients who have already transformed their lives.' },
  ctaTitle:      { type: String, default: 'Ready to Start Your Journey?' },
  ctaSubtitle:   { type: String, default: 'Book your first session today and take the first step towards the body and lifestyle you deserve.' },
}, { timestamps: true });

// ── PURCHASE (self-training program sales) ────────────────────
const purchaseSchema = new mongoose.Schema({
  user:               { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
  service:            { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
  amount:             { type: Number, required: true, min: 0 },
  paymentStatus:      { type: String, enum: ['unpaid','pending','capturing','paid','failed','refunded'], default: 'unpaid', index: true },
  cyberSourceTransId: { type: String, default: '' },
  cyberSourceOrderId: { type: String, default: '' },
  paidAt:             { type: Date, default: null },
  // Nutrition add-on chosen at checkout (price snapshot from admin settings)
  wantsNutrition:     { type: Boolean, default: false },
  nutritionPrice:     { type: Number, default: 0 },
  // Custom-program intake questionnaire answers (days/week, weight, goal, ...)
  intake:             { type: mongoose.Schema.Types.Mixed, default: null },
  // Renewal tracking — each purchase gets its own 30-day access window.
  expiresAt:             { type: Date, default: null },
  accessStatus:          { type: String, enum: ['active','grace','expired'], default: 'active' },
  renewalReminderSentAt: { type: Date, default: null },
}, { timestamps: true });
purchaseSchema.index({ user: 1, service: 1 });

// ── ACTIVITY LOG (per-user audit trail for the admin) ──────────
const activityLogSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type:      { type: String, required: true, enum: [
    'login', 'register', 'purchase_created', 'payment_success', 'payment_failed',
    'refund', 'appointment_booked', 'appointment_confirmed', 'appointment_rejected',
    'intake_submitted',
  ] },
  message:   { type: String, default: '' },
  meta:      { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });
activityLogSchema.index({ user: 1, createdAt: -1 });

const User          = mongoose.model('User',          userSchema);
const Service       = mongoose.model('Service',       serviceSchema);
const Bundle        = mongoose.model('Bundle',        bundleSchema);
const Appointment   = mongoose.model('Appointment',   appointmentSchema);
const Purchase      = mongoose.model('Purchase',      purchaseSchema);
const WorkingHours  = mongoose.model('WorkingHours',  workingHoursSchema);
const DateOverride  = mongoose.model('DateOverride',  dateOverrideSchema);
const WorkoutPlan   = mongoose.model('WorkoutPlan',   workoutPlanSchema);
const ProgressLog   = mongoose.model('ProgressLog',   progressLogSchema);
const NutritionPlan = mongoose.model('NutritionPlan', nutritionPlanSchema);
const ShopSettings  = mongoose.model('ShopSettings',  shopSettingsSchema);
const ActivityLog   = mongoose.model('ActivityLog',   activityLogSchema);

module.exports = { User, Service, Bundle, Appointment, Purchase, WorkingHours, DateOverride, WorkoutPlan, ProgressLog, NutritionPlan, ShopSettings, ActivityLog };
