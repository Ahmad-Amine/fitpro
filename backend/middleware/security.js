const rateLimit     = require('express-rate-limit');
const helmet        = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

// ── Helmet with strict CSP ────────────────────────────────────
exports.helmetConfig = helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com"],
      imgSrc:         ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc:     ["'self'"],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permissionsPolicy: { features: { camera:[], microphone:[], geolocation:[] } },
});

// ── Rate limiters ─────────────────────────────────────────────
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: false,
});

exports.registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { success: false, message: 'Too many accounts created. Try again later.' },
  standardHeaders: true, legacyHeaders: false,
});

exports.generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true, legacyHeaders: false,
});

// ── Sanitisation ──────────────────────────────────────────────
exports.mongoSanitize = mongoSanitize({ replaceWith: '_' });
exports.bodyLimit = '10kb';

// ── Strip dangerous fields from request body ──────────────────
exports.stripRoleFromBody = (req, res, next) => {
  if (req.body) {
    delete req.body.role;
    delete req.body.__v;
    delete req.body._id;
    delete req.body.isActive;   // FIX: prevent client from soft-deleting own records
    delete req.body.isPaid;     // FIX: prevent client from self-marking paid
    delete req.body.paidAmount; // FIX: only admin can set payment amounts
    delete req.body.status;     // FIX: prevent status injection on registration
    delete req.body.createdAt;
    delete req.body.updatedAt;
  }
  next();
};

// ── Seed-route guard ──────────────────────────────────────────
// Seed endpoints are unauthenticated and destructive-ish, so they require
// BOTH a non-production NODE_ENV AND an explicit ENABLE_SEED_ROUTES=true.
// This means a missing/misconfigured NODE_ENV alone can never expose them.
exports.seedGuard = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SEED_ROUTES !== 'true')
    return res.status(404).json({ success: false, message: 'Not found' });
  next();
};

// ── Validate MongoDB ObjectId params ─────────────────────────
exports.validateObjectId = (param = 'id') => (req, res, next) => {
  const id = req.params[param];
  if (!/^[a-f\d]{24}$/i.test(id))
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  next();
};

// ── Sanitise URL field (block javascript: and data: URIs) ─────
exports.sanitizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const lower = url.trim().toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return '';
  // Only allow http/https URLs
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return '';
  // Max 500 chars
  return url.trim().slice(0, 500);
};

// ── Escape regex special chars to prevent ReDoS ───────────────
exports.escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ── Startup: validate JWT_SECRET has minimum entropy ──────────
exports.validateEnv = () => {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    console.error('❌ FATAL: JWT_SECRET must be at least 32 characters. Exiting.');
    process.exit(1);
  }
  // Reject obvious placeholder/example secrets even if they are long enough
  const WEAK = ['changeme', 'secret', 'password', 'your_jwt_secret', 'CHANGE_ME'];
  if (WEAK.some(w => secret.toLowerCase().includes(w.toLowerCase()))) {
    console.error('❌ FATAL: JWT_SECRET looks like a placeholder value. Generate a real one. Exiting.');
    process.exit(1);
  }
  // Entropy sanity: a real random secret has many distinct characters
  if (new Set(secret).size < 12) {
    console.error('❌ FATAL: JWT_SECRET has too little entropy (fewer than 12 distinct characters). Exiting.');
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('❌ FATAL: MONGODB_URI not set. Exiting.');
    process.exit(1);
  }

  // ── Production posture checks ────────────────────────────────
  const csEnv = process.env.CYBERSOURCE_ENV || '';
  const isLivePayments = csEnv === 'api.cybersource.com';

  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  NODE_ENV is not "production".');
    console.warn('   → Seed endpoints are ENABLED and error messages are verbose.');
    console.warn('   → Set NODE_ENV=production on your host before going live.');
    if (isLivePayments) {
      console.error('❌ FATAL: LIVE CyberSource credentials with NODE_ENV != production.');
      console.error('   This exposes seed endpoints and verbose errors on a site taking real payments. Exiting.');
      process.exit(1);
    }
  }

  console.log(isLivePayments
    ? '💳 PAYMENTS: LIVE MODE (api.cybersource.com) — real cards will be charged.'
    : `🧪 PAYMENTS: TEST MODE (${csEnv || 'unset'}) — sandbox cards only.`);
};
