const { ActivityLog } = require('../models');

/* Best-effort activity logging — never throws, never blocks the caller. */
async function logActivity(userId, type, message = '', meta = null) {
  if (!userId) return;
  try {
    await ActivityLog.create({ user: userId, type, message, meta });
  } catch (err) {
    console.error('[activityLog] failed to record', type, err.message);
  }
}

module.exports = { logActivity };
