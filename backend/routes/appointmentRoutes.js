const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/appointmentController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/my',              protect, ctrl.getMyAppointments);
router.get('/all',             protect, adminOnly, ctrl.getAllAppointments);
router.get('/revenue',         protect, adminOnly, ctrl.getRevenueSummary);
router.post('/cleanup',        protect, adminOnly, ctrl.cleanupOldAppointments);
router.post('/',               protect, ctrl.createAppointment);
router.post('/multi',          protect, ctrl.createMultiAppointment);
router.post('/phone-booking',  protect, adminOnly, ctrl.createPhoneBooking);
router.put('/:id/cancel',      protect, ctrl.cancelAppointment);
router.put('/:id/confirm',     protect, adminOnly, ctrl.confirmAppointment);
router.put('/:id/reject',      protect, adminOnly, ctrl.rejectAppointment);
router.put('/:id/mark-paid',   protect, adminOnly, ctrl.markPaid);

// Bundles
router.get('/bundles',         ctrl.getBundles);
router.post('/bundles',        protect, adminOnly, ctrl.createBundle);
router.put('/bundles/:id',     protect, adminOnly, ctrl.updateBundle);
router.delete('/bundles/:id',  protect, adminOnly, ctrl.deleteBundle);
module.exports = router;
