const isProd = process.env.NODE_ENV === 'production';

const errorHandler = (err, req, res, next) => {
  // Always log errors (important for debugging payment issues)
  console.error(`❌ [${req.method}] ${req.path} →`, err.message);
  if (err?.response?.data) console.error('External API error:', JSON.stringify(err.response.data));

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ success: false, message: messages.join(', ') });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ success: false, message: `${field} already exists` });
  }
  if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid ID format' });
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Invalid token' });
  if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token expired' });

  const message = isProd ? 'Something went wrong' : (err.message || 'Internal server error');
  res.status(err.statusCode || 500).json({ success: false, message });
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, asyncHandler };
