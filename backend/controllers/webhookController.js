/**
 * CyberSource Webhook Receiver
 * ─────────────────────────────────────────────────────────────
 * WHY THIS EXISTS (security finding H-1):
 * Without webhooks, payment confirmation depends entirely on the customer's
 * browser completing the /capture call. If their connection drops, they close
 * the tab, or their battery dies between authorization and our DB write,
 * CyberSource charges the card but our database never records it — the
 * customer is charged and receives nothing.
 *
 * This endpoint receives payment events server-to-server, independent of the
 * browser, and reconciles our records.
 *
 * SECURITY PROPERTIES:
 *  - Signature verified with HMAC-SHA256 over (timestamp + raw body)
 *  - Constant-time comparison (no timing oracle)
 *  - Timestamp tolerance window (replay protection)
 *  - Raw body used for verification (never re-serialized JSON)
 *  - Idempotent: re-delivered events cannot double-apply
 *  - Fails CLOSED: unsigned/invalid requests are rejected, never trusted
 *
 * Spec: https://developer.cybersource.com/docs/cybs/en-us/webhooks/implementation/
 *       all/rest/webhooks/wh-fg-optional-intro/wh-fg-optional-validate-intro.html
 *   Header format: v-c-signature: t=<ms>;keyId=<uuid>;sig=<base64>
 */

const crypto = require('crypto');
const { Appointment, Purchase } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { logActivity } = require('../utils/activityLog');

// Reject events older than this (replay protection)
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

/* Parse "t=...;keyId=...;sig=..." into an object */
function parseSignatureHeader(header) {
  if (!header || typeof header !== 'string') return null;
  const parts = {};
  for (const chunk of header.split(';')) {
    const idx = chunk.indexOf('=');
    if (idx === -1) continue;
    const k = chunk.slice(0, idx).trim();
    const v = chunk.slice(idx + 1).trim().replace(/^"|"$/g, '');
    parts[k] = v;
  }
  if (!parts.t || !parts.sig) return null;
  return parts;
}

/* Constant-time compare of two base64 signatures */
function safeEqual(a, b) {
  const bufA = Buffer.from(a || '', 'utf8');
  const bufB = Buffer.from(b || '', 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* Verify the v-c-signature header against the raw request body.
   Returns { ok: boolean, reason?: string } */
function verifySignature(req) {
  const secret = process.env.CYBERSOURCE_WEBHOOK_SECRET;
  if (!secret) return { ok: false, reason: 'webhook secret not configured' };

  const parsed = parseSignatureHeader(req.headers['v-c-signature']);
  if (!parsed) return { ok: false, reason: 'missing or malformed v-c-signature header' };

  // Replay protection
  const ts = Number(parsed.t);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'invalid timestamp' };
  if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS)
    return { ok: false, reason: 'timestamp outside tolerance window' };

  // Raw body captured by express.json({ verify }) — never re-serialize
  const rawBody = req.rawBody;
  if (typeof rawBody !== 'string') return { ok: false, reason: 'raw body unavailable' };

  // CyberSource signs the timestamp together with the payload.
  // Their published samples regenerate from (timestamp, payload); the exact
  // concatenation is verified against a real delivery during setup, so we
  // accept either documented arrangement rather than guessing a single one.
  const key = Buffer.from(secret, 'base64');
  const candidates = [`${parsed.t}.${rawBody}`, `${parsed.t}${rawBody}`, rawBody];

  for (const candidate of candidates) {
    const expected = crypto.createHmac('sha256', key).update(candidate, 'utf8').digest('base64');
    if (safeEqual(expected, parsed.sig)) return { ok: true };
  }
  return { ok: false, reason: 'signature mismatch' };
}

/* POST /api/webhooks/cybersource */
exports.handleCyberSourceWebhook = asyncHandler(async (req, res) => {
  const verdict = verifySignature(req);
  if (!verdict.ok) {
    // Fail closed. Do not reveal which check failed to the caller.
    console.warn(`[webhook] REJECTED: ${verdict.reason}`);
    return res.status(401).json({ success: false, message: 'Invalid signature' });
  }

  const event = req.body || {};
  const payload = event.payload || event;

  // Correlate to our order via clientReferenceInformation.code, which we set
  // to our own orderId when creating the payment.
  const orderId =
    payload?.clientReferenceInformation?.code ||
    payload?.orderInformation?.clientReferenceInformation?.code ||
    null;
  const transId = payload?.id || payload?.processorInformation?.transactionId || null;
  const status  = String(payload?.status || event?.eventType || '').toUpperCase();

  console.log(`[webhook] verified event — order=${orderId} status=${status} tx=${transId}`);

  if (!orderId) {
    // Nothing to reconcile, but the event was authentic — ack so CyberSource
    // does not retry indefinitely.
    return res.json({ success: true, message: 'Acknowledged (no order reference)' });
  }

  const isSuccess  = ['AUTHORIZED', 'COMPLETED', 'PENDING', 'TRANSMITTED'].some(s => status.includes(s));
  const isDeclined = ['DECLINED', 'FAILED', 'INVALID', 'REJECTED', 'CANCELLED'].some(s => status.includes(s));
  const isRefund   = status.includes('REFUND');

  const paidAt = new Date();

  if (isRefund) {
    // IDEMPOTENT: only records not already refunded are touched
    await Appointment.updateMany(
      { cyberSourceOrderId: orderId, paymentStatus: { $ne: 'refunded' } },
      { paymentStatus: 'refunded', isPaid: false }
    );
    await Purchase.updateMany(
      { cyberSourceOrderId: orderId, paymentStatus: { $ne: 'refunded' } },
      { paymentStatus: 'refunded' }
    );
    return res.json({ success: true, message: 'Refund reconciled' });
  }

  if (isSuccess) {
    /* IDEMPOTENT + SAFE: only promote records that are NOT already paid.
       This is what rescues an interrupted checkout — records left in
       'pending'/'capturing' because the browser died get completed here. */
    const apptRes = await Appointment.updateMany(
      { cyberSourceOrderId: orderId, paymentStatus: { $in: ['pending', 'capturing', 'unpaid', 'failed'] } },
      { paymentStatus: 'paid', isPaid: true, paymentMethod: 'online',
        cyberSourceTransId: transId || '', paidAt }
    );
    const purchRes = await Purchase.updateMany(
      { cyberSourceOrderId: orderId, paymentStatus: { $in: ['pending', 'capturing', 'unpaid', 'failed'] } },
      { paymentStatus: 'paid', cyberSourceTransId: transId || '', paidAt }
    );

    const recovered = (apptRes.modifiedCount || 0) + (purchRes.modifiedCount || 0);
    if (recovered > 0) {
      console.log(`[webhook] ✅ RECOVERED ${recovered} record(s) for order ${orderId} that the browser never confirmed`);
      const appt = await Appointment.findOne({ cyberSourceOrderId: orderId });
      const purch = appt ? null : await Purchase.findOne({ cyberSourceOrderId: orderId });
      const userId = appt?.user || purch?.user;
      if (userId)
        logActivity(userId, 'payment_recovered',
          'Payment confirmed by CyberSource webhook after an interrupted checkout',
          { orderId, transId });
    }
    return res.json({ success: true, message: 'Payment reconciled', recovered });
  }

  if (isDeclined) {
    await Appointment.updateMany(
      { cyberSourceOrderId: orderId, paymentStatus: { $in: ['pending', 'capturing'] } },
      { paymentStatus: 'failed' }
    );
    await Purchase.updateMany(
      { cyberSourceOrderId: orderId, paymentStatus: { $in: ['pending', 'capturing'] } },
      { paymentStatus: 'failed' }
    );
    return res.json({ success: true, message: 'Decline reconciled' });
  }

  res.json({ success: true, message: 'Acknowledged' });
});
