const express = require('express');
const router  = express.Router();
const {
  register, login, getMe, updateMe, seedAdmin,
  getAllUsers, resetUserPassword, toggleUserActive, deleteUser, getUserActivity
} = require('../controllers/authController');
const { protect, adminOnly } = require('../middleware/auth');
const { loginLimiter, registerLimiter, generalLimiter, stripRoleFromBody, seedGuard } = require('../middleware/security');

router.post('/register', registerLimiter, stripRoleFromBody, register);
router.post('/login',    loginLimiter, login);
router.get('/me',        protect, getMe);
router.put('/me',        protect, generalLimiter, updateMe);
router.get('/seed-admin', seedGuard, generalLimiter, seedAdmin);

router.get('/users',                          protect, adminOnly, getAllUsers);
router.put('/users/:id/reset-password',       protect, adminOnly, generalLimiter, resetUserPassword);
router.put('/users/:id/toggle-active',        protect, adminOnly, toggleUserActive);
router.delete('/users/:id',                   protect, adminOnly, deleteUser);
router.get('/users/:id/activity',             protect, adminOnly, getUserActivity);

module.exports = router;
