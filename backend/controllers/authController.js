const { User, ActivityLog } = require('../models');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const { asyncHandler } = require('../middleware/errorHandler');
const { escapeRegex }  = require('../middleware/security');
const { logActivity }  = require('../utils/activityLog');

/* SECURITY: shorter token lifetime limits the damage window of a stolen token.
   Override with JWT_EXPIRES_IN if a different policy is needed. */
const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, {
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
});
const isStrongPassword = (pw) => pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
const sanitize = (str) => (typeof str === 'string' ? str.trim() : '');

exports.register = asyncHandler(async (req, res) => {
  const name     = sanitize(req.body.name);
  const email    = sanitize(req.body.email).toLowerCase();
  const password = sanitize(req.body.password);
  const phone    = sanitize(req.body.phone);

  if (!name || !email || !password || !phone)
    return res.status(400).json({ success: false, message: 'All fields are required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ success: false, message: 'Invalid email format' });
  if (!isStrongPassword(password))
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters with 1 uppercase and 1 number' });
  if (name.length > 100 || email.length > 150 || phone.length > 30)
    return res.status(400).json({ success: false, message: 'Input too long' });
  // International format: +<countrycode><number>, digits/spaces only after +
  if (!/^\+\d{1,4}[\d\s-]{5,15}$/.test(phone))
    return res.status(400).json({ success: false, message: 'Phone must include country code, e.g. +961 3 123456' });

  const exists = await User.findOne({ email });
  if (exists) return res.status(409).json({ success: false, message: 'Email already registered' });

  // Force role to customer regardless of what was sent
  const user  = await User.create({ name, email, password, phone, role: 'customer' });
  const token = signToken(user._id);
  logActivity(user._id, 'register', `${user.name} registered`);
  res.status(201).json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

/* PUT /api/auth/me — user updates their own profile (name, phone).
   Email and role are intentionally NOT editable here: email is the login
   identity, role changes would be privilege escalation. */
exports.updateMe = asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.name !== undefined) {
    const name = sanitize(req.body.name);
    if (!name || name.length > 100) return res.status(400).json({ success: false, message: 'Invalid name' });
    update.name = name;
  }
  if (req.body.phone !== undefined) {
    const phone = sanitize(req.body.phone);
    if (!/^\+\d{1,4}[\d\s-]{5,15}$/.test(phone))
      return res.status(400).json({ success: false, message: 'Phone must include country code, e.g. +961 3 123456' });
    update.phone = phone;
  }
  if (Object.keys(update).length === 0)
    return res.status(400).json({ success: false, message: 'Nothing to update' });

  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true }).select('-password');
  res.json({ success: true, user, message: 'Profile updated' });
});

exports.login = asyncHandler(async (req, res) => {
  const email    = sanitize(req.body.email).toLowerCase();
  const password = sanitize(req.body.password);
  if (!email || !password)
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  if (email.length > 200 || password.length > 200)
    return res.status(400).json({ success: false, message: 'Invalid input' });

  const user = await User.findOne({ email });

  /* SECURITY (user enumeration): always perform a bcrypt comparison, even when
     the account does not exist, so response timing does not reveal whether an
     email is registered. The dummy hash below is a valid bcrypt hash of a
     random string, so the work factor matches a real comparison. */
  const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const passwordOk = user
    ? await user.matchPassword(password)
    : await bcrypt.compare(password, DUMMY_HASH);

  if (!user || !passwordOk)
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  if (user.isActive === false)
    return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });

  const token = signToken(user._id);
  logActivity(user._id, 'login', `${user.name} logged in`);
  res.json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

exports.getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user });
});

// FIX: seed-admin now disabled in production
exports.seedAdmin = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production')
    return res.status(403).json({ success: false, message: 'Seed disabled in production' });

  const exists = await User.findOne({ role: 'admin' });
  if (exists) return res.json({ success: true, message: 'Admin already exists.' });

  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_PHONE } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
    return res.status(500).json({ success: false, message: 'Admin credentials not in .env' });

  await User.create({ name: ADMIN_NAME || 'Admin', email: ADMIN_EMAIL.toLowerCase(), password: ADMIN_PASSWORD, phone: ADMIN_PHONE || '00000000', role: 'admin' });
  res.json({ success: true, message: 'Admin created. You can now log in.' });
});

// FIX: escape regex to prevent ReDoS
exports.getAllUsers = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 20);
  const skip  = (page - 1) * limit;

  let filter = {};
  if (req.query.q) {
    const q = sanitize(req.query.q).slice(0, 100); // cap search length
    const safe = escapeRegex(q);
    filter = { $or: [
      { name:  { $regex: safe, $options: 'i' } },
      { email: { $regex: safe, $options: 'i' } },
      { phone: { $regex: safe, $options: 'i' } },
    ]};
  }

  const [users, total] = await Promise.all([
    User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, data: users, total, page, pages: Math.ceil(total / limit) });
});

exports.resetUserPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || !isStrongPassword(newPassword))
    return res.status(400).json({ success: false, message: 'Password must be 8+ chars with 1 uppercase and 1 number' });
  if (newPassword.length > 200)
    return res.status(400).json({ success: false, message: 'Password too long' });

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot reset admin password here' });

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: `Password reset for ${user.name}` });
});

exports.toggleUserActive = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot deactivate admin' });
  user.isActive = !user.isActive;
  await user.save();
  res.json({ success: true, data: { _id: user._id, isActive: user.isActive }, message: user.isActive ? `${user.name} activated` : `${user.name} deactivated` });
});

exports.getUserActivity = asyncHandler(async (req, res) => {
  const logs = await ActivityLog.find({ user: req.params.id }).sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, data: logs });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot delete admin account' });
  if (user._id.toString() === req.user._id.toString()) return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: `${user.name} has been permanently deleted` });
});
