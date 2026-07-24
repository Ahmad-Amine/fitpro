const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const { protect, adminOnly } = require('../middleware/auth');
const { createPurchase, getMyPurchases, getAllPurchases, getRenewals, markReminded } = require('../controllers/purchaseController');

const purchaseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many requests. Please wait.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/',     purchaseLimiter, protect, createPurchase);
router.get('/mine',                   protect, getMyPurchases);
router.get('/admin/renewals',         protect, adminOnly, getRenewals);
router.put('/admin/renewals/:kind/:id/remind', protect, adminOnly, markReminded);
router.get('/',                       protect, adminOnly, getAllPurchases);

module.exports = router;
