const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/workoutController');
const { protect, adminOnly } = require('../middleware/auth');

// Workout Plans
router.get('/plans/my',                  protect, ctrl.getMyWorkoutPlans);
router.get('/plans/:id',                 protect, ctrl.getWorkoutPlanById);
router.get('/admin/plans/:userId',       protect, adminOnly, ctrl.getUserWorkoutPlans);
router.post('/plans',                    protect, adminOnly, ctrl.createWorkoutPlan);
router.put('/plans/:id',                 protect, adminOnly, ctrl.updateWorkoutPlan);
router.delete('/plans/:id',              protect, adminOnly, ctrl.deleteWorkoutPlan);

// Nutrition
router.get('/nutrition/my',              protect, ctrl.getMyNutrition);
router.get('/admin/nutrition-pending',   protect, adminOnly, ctrl.getNutritionPending);
router.get('/admin/custom-pending',      protect, adminOnly, ctrl.getCustomPending);
router.get('/admin/eligible-users',      protect, adminOnly, ctrl.getEligibleUsers);
router.get('/admin/nutrition/:userId',   protect, adminOnly, ctrl.getUserNutrition);
router.put('/admin/nutrition/:userId',   protect, adminOnly, ctrl.upsertNutrition);

// Progress
router.get('/progress/my',              protect, ctrl.getMyProgress);
router.post('/progress',                protect, ctrl.logProgress);
router.delete('/progress/:id',          protect, ctrl.deleteProgressLog);
router.get('/admin/progress/:userId',   protect, adminOnly, ctrl.getUserProgress);

module.exports = router;
