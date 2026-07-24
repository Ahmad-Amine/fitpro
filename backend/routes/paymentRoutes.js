const express    = require('express');
const router     = express.Router();
const rateLimit  = require('express-rate-limit');
const { protect, adminOnly } = require('../middleware/auth');
const {
  createOrder,
  capturePayment,
  getPaymentStatus,
  refundPayment,
  refundPurchase,
  testAuth,
} = require('../controllers/paymentController');

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many payment attempts. Please wait 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Test route — admin only in production
router.get('/test-auth', protect, adminOnly, testAuth);

// Payment routes
router.post('/create-order',           paymentLimiter, protect, createOrder);
router.post('/capture',                paymentLimiter, protect, capturePayment);
router.get('/status/:orderId',                         protect, getPaymentStatus);
router.post('/refund/:appointmentId',                  protect, adminOnly, refundPayment);
router.post('/refund-purchase/:purchaseId',             protect, adminOnly, refundPurchase);

module.exports = router;
