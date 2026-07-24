const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const { handleCyberSourceWebhook } = require('../controllers/webhookController');

/* NOTE: no `protect` middleware here by design — CyberSource authenticates
   itself with the v-c-signature HMAC header, not a user JWT. The signature
   check inside the controller IS the authentication, and it fails closed. */

// Generous limit (CyberSource may burst-retry), but still bounded to blunt
// a flood of forged requests forcing HMAC computation.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/cybersource', webhookLimiter, handleCyberSourceWebhook);

module.exports = router;
