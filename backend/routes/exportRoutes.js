const express  = require('express');
const router   = express.Router();
const { exportAppointments, exportUsers } = require('../controllers/exportController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/appointments', protect, adminOnly, exportAppointments);
router.get('/users',        protect, adminOnly, exportUsers);

module.exports = router;
