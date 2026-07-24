const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/serviceController');
const { protect, adminOnly, optionalAuth } = require('../middleware/auth');
const { seedGuard } = require('../middleware/security');

router.get('/seed', seedGuard, ctrl.seedServices);
router.get('/',       optionalAuth, ctrl.getAllServices);
router.get('/:id',    optionalAuth, ctrl.getServiceById);
router.post('/',      protect, adminOnly, ctrl.createService);
router.put('/:id',    protect, adminOnly, ctrl.updateService);
router.delete('/:id', protect, adminOnly, ctrl.deleteService);
module.exports = router;
