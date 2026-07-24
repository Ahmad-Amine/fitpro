const jwt      = require('jsonwebtoken');
const { User } = require('../models');

exports.protect = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Not authorized — no token' });
  try {
    const token   = auth.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user      = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ success: false, message: 'User not found' });
    if (req.user.isActive === false)
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact support.' });
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Admin access only' });
  next();
};

/* Attaches req.user if a valid token is present; never blocks the request.
   Used on public routes whose response is richer for authenticated users
   (e.g. unlocking purchased program content). */
exports.optionalAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return next();
  try {
    const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (user && user.isActive !== false) req.user = user;
  } catch { /* invalid token → treat as anonymous */ }
  next();
};
