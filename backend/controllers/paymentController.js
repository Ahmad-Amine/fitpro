/**
 * CyberSource Payment Controller
 * Authentication: JWT with Shared Secret (HS256 / HMAC-SHA256)
 * Migrated from deprecated HTTP Signature per CyberSource's Sept 2026 deadline.
 * Spec: https://developer.cybersource.com/docs/cybs/en-us/platform/developer/all/rest/rest-getting-started/restgs-jwt-shared-secret-intro/restgs-jwt-con-shared-secret-intro.html
 */

const crypto  = require('crypto');
const axios   = require('axios');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Appointment, Purchase, Service, Bundle, WorkoutPlan, NutritionPlan } = require('../models');
const { asyncHandler } = require('../middleware/errorHandler');
const { logActivity }  = require('../utils/activityLog');

/* ─── Config ─── */
const CS_ENV      = process.env.CYBERSOURCE_ENV       || 'apitest.cybersource.com';
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const KEY_ID      = process.env.CYBERSOURCE_API_KEY_ID;
const SECRET_KEY  = process.env.CYBERSOURCE_SECRET_KEY;

/* ─── JWT (Shared Secret) auth builder ───
   Per CyberSource's official spec, the whole request is authenticated via a
   single signed JWS sent as a Bearer token — no more per-request HTTP
   Signature headers. Same merchantKeyId/merchantsecretKey credentials as
   before, just a different envelope. */
function buildJwtToken(method, path, body = null) {
  const bodyStr = body ? JSON.stringify(body) : '{}';
  const digest  = crypto.createHash('sha256').update(bodyStr, 'utf8').digest('base64');
  const now     = Math.floor(Date.now() / 1000);

  const payload = {
    digest,
    digestAlgorithm:          'SHA-256',
    iat:                      now,
    exp:                      now + 120,
    'request-method':         method.toLowerCase(),
    'request-resource-path':  path,
    'request-host':           CS_ENV,
    iss:                      MERCHANT_ID,
    jti:                      uuidv4(),
    'v-c-jwt-version':        '2',
    'v-c-merchant-id':        MERCHANT_ID,
  };

  return jwt.sign(payload, Buffer.from(SECRET_KEY, 'base64'), {
    algorithm: 'HS256',
    header:    { kid: KEY_ID, typ: 'JWT' },
  });
}

/* ─── CyberSource HTTP request ─── */
async function csRequest(method, path, body = null) {
  const token = buildJwtToken(method, path, body);
  const url   = `https://${CS_ENV}${path}`;

  console.log(`[CS] ${method.toUpperCase()} ${url}`);

  const resp = await axios({
    method,
    url,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json;charset=utf-8',
      'Accept':        'application/hal+json;charset=utf-8',
    },
    data:           body || undefined,
    validateStatus: null,
  });

  console.log(`[CS] Status: ${resp.status}`, JSON.stringify(resp.data).slice(0, 200));

  if (resp.status >= 400) {
    const err    = new Error(`CyberSource error ${resp.status}`);
    err.response = { data: resp.data, status: resp.status };
    throw err;
  }

  return resp.data;
}

/* ══════════════════════════════════════════════════════
   GET /api/payment/test-auth
   ══════════════════════════════════════════════════════ */
exports.testAuth = asyncHandler(async (req, res) => {
  const missing = [];
  if (!MERCHANT_ID) missing.push('CYBERSOURCE_MERCHANT_ID');
  if (!KEY_ID)      missing.push('CYBERSOURCE_API_KEY_ID');
  if (!SECRET_KEY)  missing.push('CYBERSOURCE_SECRET_KEY');

  if (missing.length > 0) {
    return res.status(200).json({
      success: false,
      message: 'Missing environment variables',
      missing,
    });
  }

  const config = {
    MERCHANT_ID,
    KEY_ID,
    SECRET_KEY_PREVIEW: SECRET_KEY.slice(0, 6) + '...' + SECRET_KEY.slice(-4),
    CS_ENV,
  };

  try {
    const result = await csRequest(
      'GET',
      '/reporting/v3/payment-batch-summaries?startTime=2026-01-01T00:00:00.000Z&endTime=2026-01-02T00:00:00.000Z'
    );
    res.status(200).json({ success: true, message: '✅ Authentication working!', config, result });
  } catch (err) {
    // Always return 200 so NODE_ENV=production doesn't swallow the error
    res.status(200).json({
      success:    false,
      message:    '❌ Authentication failed',
      config,
      csStatus:   err?.response?.status,
      csError:    err?.response?.data,
      localError: err.message,
    });
  }
});

/* ══════════════════════════════════════════════════════
   POST /api/payment/create-order
   ══════════════════════════════════════════════════════ */
exports.createOrder = asyncHandler(async (req, res) => {
  const { appointmentIds, purchaseIds } = req.body;
  // Currency is server-controlled — never trust client input for money fields.
  const currency = 'USD';

  const isPurchaseOrder = Array.isArray(purchaseIds) && purchaseIds.length > 0;
  if (!isPurchaseOrder) {
    if (!appointmentIds || !Array.isArray(appointmentIds) || appointmentIds.length === 0)
      return res.status(400).json({ success: false, message: 'appointmentIds or purchaseIds required' });
    if (appointmentIds.length > 50 || !appointmentIds.every(id => typeof id === 'string' && id.length <= 40))
      return res.status(400).json({ success: false, message: 'Invalid appointmentIds' });
  } else {
    if (purchaseIds.length > 10 || !purchaseIds.every(id => typeof id === 'string' && id.length <= 40))
      return res.status(400).json({ success: false, message: 'Invalid purchaseIds' });
  }

  // Release any of this user's own "pending" orders for these appointments,
  // plus "capturing" locks older than 2 minutes (crashed mid-capture).
  // This is double-spend safe: creating a new order overwrites
  // cyberSourceOrderId, and capturePayment requires BOTH the matching orderId
  // AND paymentStatus 'pending' — so any stale tab's capture with the old
  // orderId fails cleanly with 404.
  let appts = [];
  let purchases = [];
  let totalAmount = 0;

  if (isPurchaseOrder) {
    // ── Self-training program purchase(s) ──
    await Purchase.updateMany(
      {
        _id: { $in: purchaseIds }, user: req.user._id,
        $or: [
          { paymentStatus: 'pending' },
          { paymentStatus: 'capturing', updatedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } },
        ],
      },
      { paymentStatus: 'unpaid', cyberSourceOrderId: '' }
    );
    purchases = await Purchase.find({
      _id:           { $in: purchaseIds },
      user:          req.user._id,
      paymentStatus: { $in: ['unpaid', 'failed'] },
    }).populate('service', 'name price isActive trainingType');

    if (purchases.length === 0)
      return res.status(404).json({ success: false, message: 'No valid unpaid purchases found' });

    // Server-side amount: CURRENT admin-set price + nutrition add-on snapshot
    for (const pch of purchases) {
      if (!pch.service || pch.service.isActive === false)
        return res.status(400).json({ success: false, message: 'Program no longer available' });
      totalAmount += Number(pch.service.price ?? pch.amount ?? 0)
                   + (pch.wantsNutrition ? Number(pch.nutritionPrice || 0) : 0);
    }
  } else {
    await Appointment.updateMany(
      {
        _id:  { $in: appointmentIds },
        user: req.user._id,
        $or: [
          { paymentStatus: 'pending' },
          { paymentStatus: 'capturing', updatedAt: { $lt: new Date(Date.now() - 2 * 60 * 1000) } },
        ],
      },
      { paymentStatus: 'unpaid', cyberSourceOrderId: '' }
    );

    appts = await Appointment.find({
      _id:           { $in: appointmentIds },
      user:          req.user._id,
      paymentStatus: { $in: ['unpaid', 'failed'] },
    }).populate('service', 'name price priceLive priceOnline');

    if (appts.length === 0) {
      return res.status(404).json({ success: false, message: 'No valid unpaid appointments found' });
    }

    // Calculate total server-side (never trust client).
    // paidAmount is the mode-aware snapshot set at booking (live/online price).
    const bundleGroups = {};
    for (const a of appts) {
      // Nutrition add-on (stored on the first appointment of the order)
      if (a.nutritionAddon) totalAmount += Number(a.nutritionPrice || 0);
      if (a.isBundle && a.bundleGroupId) {
        if (!bundleGroups[a.bundleGroupId])
          bundleGroups[a.bundleGroupId] = { appt: a };
      } else {
        totalAmount += Number(a.paidAmount || a.service?.price || 0);
      }
    }
    for (const g of Object.values(bundleGroups))
      totalAmount += Number(g.appt.paidAmount || g.appt.service?.price || 0);
  }

  totalAmount = Math.round(totalAmount * 100) / 100;

  if (totalAmount <= 0)
    return res.status(400).json({ success: false, message: 'Invalid total amount' });

  const orderId = uuidv4();

  // Get Flex Microform v2 capture context (JWT)
  let clientToken            = null;
  let clientLibrary          = null;
  let clientLibraryIntegrity = null;
  let flexErrorDetail        = null;

  try {
    const flexBody = {
      targetOrigins:       ['https://www.aya-fit.com', 'https://aya-fit.com', 'http://localhost:3000'],
      allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX'],
      clientVersion:       'v2.0',
    };

    console.log('[CS] Requesting Flex session from /microform/v2/sessions...');
    const flexRes = await csRequest('POST', '/microform/v2/sessions', flexBody);
    console.log('[CS] Flex raw response type:', typeof flexRes);

    // Response is a JWT string directly (per official docs)
    const jwt = typeof flexRes === 'string' ? flexRes : null;

    if (jwt && jwt.split('.').length === 3) {
      clientToken = jwt;
      try {
        // Add padding for base64 decode
        const b64     = jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        const padded  = b64 + '='.repeat((4 - b64.length % 4) % 4);
        const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
        clientLibrary          = payload?.ctx?.[0]?.data?.clientLibrary          || null;
        clientLibraryIntegrity = payload?.ctx?.[0]?.data?.clientLibraryIntegrity || null;
        console.log('[CS] ✅ Flex JWT decoded, clientLibrary:', clientLibrary);
      } catch (decodeErr) {
        console.warn('[CS] JWT decode warning:', decodeErr.message);
        // JWT still valid even if we can't decode it
        clientLibrary = 'https://testflex.cybersource.com/microform/bundle/v2/flex-microform.min.js';
      }
    } else {
      console.warn('[CS] Flex response was not a JWT string:', JSON.stringify(flexRes).slice(0, 200));
      flexErrorDetail = 'Unexpected response format from CyberSource';
    }
  } catch (e) {
    flexErrorDetail = e?.response?.data?.message || e?.response?.data || e.message;
    console.error('[CS] ❌ Flex session failed:', JSON.stringify(flexErrorDetail));
  }

  // If Flex completely failed, return error immediately — don't mark as pending
  if (!clientToken) {
    return res.status(503).json({
      success: false,
      message: 'Payment system temporarily unavailable. Please try again in a moment.',
      flexError: process.env.NODE_ENV !== 'production' ? flexErrorDetail : undefined,
    });
  }

  // Mark as pending
  if (isPurchaseOrder) {
    await Purchase.updateMany(
      { _id: { $in: purchases.map(pc => pc._id) } },
      { paymentStatus: 'pending', cyberSourceOrderId: orderId, amount: totalAmount / purchases.length }
    );
  } else {
    await Appointment.updateMany(
      { _id: { $in: appts.map(a => a._id) } },
      { paymentStatus: 'pending', cyberSourceOrderId: orderId }
    );
  }

  res.json({
    success:               true,
    orderId,
    totalAmount,
    currency,
    clientToken,
    clientLibrary,
    clientLibraryIntegrity,
    environment: CS_ENV.includes('apitest') ? 'sandbox' : 'production',
  });
});

/* ══════════════════════════════════════════════════════
   POST /api/payment/capture
   ══════════════════════════════════════════════════════ */
exports.capturePayment = asyncHandler(async (req, res) => {
  const { orderId, transientToken, billingDetails = {} } = req.body;

  if (!orderId)
    return res.status(400).json({ success: false, message: 'orderId required' });
  if (!transientToken)
    return res.status(400).json({ success: false, message: 'transientToken required' });

  // Validate token shape: Microform v2 transient tokens are JWTs (or JSON-wrapped)
  if (typeof transientToken !== 'string' || transientToken.length > 8192)
    return res.status(400).json({ success: false, message: 'Invalid payment token' });
  if (transientToken.startsWith('FALLBACK-') || transientToken.startsWith('SANDBOX-'))
    return res.status(400).json({ success: false, message: 'Invalid payment token' });

  // ATOMIC CLAIM — prevents double-charge race: if two capture requests race
  // (double-click, two tabs, retried request), only the one that flips
  // 'pending' -> 'capturing' proceeds; the loser matches 0 documents.
  const claim = await Appointment.updateMany(
    {
      user:               req.user._id,
      cyberSourceOrderId: orderId,
      paymentStatus:      'pending',
    },
    { paymentStatus: 'capturing' }
  );

  let appts = [];
  let purchases = [];
  let isPurchaseOrder = false;

  if (claim.modifiedCount > 0) {
    appts = await Appointment.find({
      user:               req.user._id,
      cyberSourceOrderId: orderId,
      paymentStatus:      'capturing',
    }).populate('service', 'name price');
  } else {
    // Purchases path (self-training programs) — same atomic pending→capturing claim
    const pClaim = await Purchase.updateMany(
      { user: req.user._id, cyberSourceOrderId: orderId, paymentStatus: 'pending' },
      { paymentStatus: 'capturing' }
    );
    if (pClaim.modifiedCount > 0) {
      purchases = await Purchase.find({
        user: req.user._id, cyberSourceOrderId: orderId, paymentStatus: 'capturing',
      }).populate('service', 'name price');
    }
    isPurchaseOrder = purchases.length > 0;
  }

  if (appts.length === 0 && purchases.length === 0)
    return res.status(404).json({ success: false, message: 'No pending payment found' });

  const totalAmount = isPurchaseOrder
    ? purchases.reduce((sum, pc) => sum
        + Number(pc.service?.price ?? pc.amount ?? 0)
        + (pc.wantsNutrition ? Number(pc.nutritionPrice || 0) : 0), 0)
    : appts.reduce((sum, a) => sum
        + Number(a.paidAmount || a.service?.price || 0)
        + (a.nutritionAddon ? Number(a.nutritionPrice || 0) : 0), 0);

  const [firstName, ...rest] = (billingDetails.name || req.user.name || 'Customer User').split(' ');

  // SECURITY: release the atomic claim if we bail out before contacting
  // CyberSource, so records are never orphaned in 'capturing'.
  const releaseClaim = async () => {
    if (isPurchaseOrder)
      await Purchase.updateMany({ _id: { $in: purchases.map(pc => pc._id) } }, { paymentStatus: 'pending' });
    else
      await Appointment.updateMany({ _id: { $in: appts.map(a => a._id) } }, { paymentStatus: 'pending' });
  };

  // Handle token as object (from Flex) or string.
  // SECURITY: malformed JSON must not throw after the claim is taken.
  let tokenValue;
  try {
    tokenValue = typeof transientToken === 'string' && transientToken.trim().startsWith('{')
      ? JSON.parse(transientToken)
      : transientToken;
  } catch {
    await releaseClaim();
    return res.status(400).json({ success: false, message: 'Invalid payment token format. Please try again.' });
  }

  /* SECURITY: sanitize billing details before relaying to the payment
     processor — trim, length-cap, strip control characters, and constrain
     country to an ISO-3166 alpha-2 code. Never forward raw client input. */
  const clean = (v, max) => {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
  };
  const bill = {
    firstName: clean(billingDetails.firstName, 60) || clean(firstName, 60) || 'Customer',
    lastName:  clean(billingDetails.lastName, 60)  || clean(rest.join(' '), 60) || 'User',
    email:     clean(billingDetails.email, 254)    || req.user.email || 'customer@example.com',
    phone:     clean(billingDetails.phone, 32)     || req.user.phone || '00000000',
    address:   clean(billingDetails.address, 120)  || 'N/A',
    city:      clean(billingDetails.city, 60)      || 'Beirut',
    country:   (clean(billingDetails.country, 2).toUpperCase().match(/^[A-Z]{2}$/) || ['LB'])[0],
    postal:    clean(billingDetails.postal, 12)    || '00000',
  };
  if (bill.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bill.email)) {
    await releaseClaim();
    return res.status(400).json({ success: false, message: 'Invalid billing email address.' });
  }

  const csBody = {
    clientReferenceInformation: { code: orderId },
    processingInformation:      { capture: true },
    // Flex Microform v2 transient token is a JWT referenced at the ROOT level.
    // (fluidData is for encrypted card-reader integrations, not Microform v2.)
    tokenInformation: {
      transientTokenJwt: typeof tokenValue === 'string' ? tokenValue : JSON.stringify(tokenValue),
    },
    orderInformation: {
      amountDetails: {
        totalAmount: totalAmount.toFixed(2),
        currency:    'USD',
      },
      billTo: {
        firstName:   bill.firstName,
        lastName:    bill.lastName,
        email:       bill.email,
        phoneNumber: bill.phone,
        address1:    bill.address,
        locality:    bill.city,
        country:     bill.country,
        postalCode:  bill.postal,
      },
    },
  };

  let csResponse;
  try {
    csResponse = await csRequest('POST', '/pts/v2/payments', csBody);
  } catch (err) {
    const errData = err?.response?.data;
    const hadNutrition = isPurchaseOrder ? purchases.some(pc => pc.wantsNutrition) : appts.some(a => a.nutritionAddon);
    console.error('[CS] Payment error (full):', JSON.stringify(errData), '| totalAmount:', totalAmount, '| hadNutrition:', hadNutrition);
    await Appointment.updateMany(
      { _id: { $in: appts.map(a => a._id) } },
      { paymentStatus: 'failed' }
    );
    if (isPurchaseOrder)
      await Purchase.updateMany({ _id: { $in: purchases.map(pc => pc._id) } }, { paymentStatus: 'failed' });
    logActivity(req.user._id, 'payment_failed', `Payment of $${totalAmount} failed: ${errData?.message || 'declined'}`, { orderId, totalAmount, reason: errData?.errorInformation?.reason });
    return res.status(402).json({
      success: false,
      message: errData?.message || 'Payment declined. Please check your card details.',
      reason:  errData?.errorInformation?.reason || 'UNKNOWN',
    });
  }

  const csStatus  = csResponse?.status;
  const csTransId = csResponse?.id;
  const paidAt    = new Date();

  if (csStatus === 'AUTHORIZED' || csStatus === 'COMPLETED') {
    // Each purchase/bundle-booking gets its own 30-day access window,
    // starting fresh from THIS payment (renewals reset it, they don't stack).
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (isPurchaseOrder) {
      const expiresAt = new Date(paidAt.getTime() + THIRTY_DAYS);
      await Purchase.updateMany(
        { _id: { $in: purchases.map(pc => pc._id) } },
        { paymentStatus: 'paid', cyberSourceTransId: csTransId, paidAt, expiresAt, accessStatus: 'active', renewalReminderSentAt: null }
      );
    } else {
      let apptUpdate = {
        isPaid:             true,
        paymentStatus:      'paid',
        paymentMethod:      'online',
        cyberSourceTransId: csTransId,
        paidAt,
      };
      // Only session bundles/packages carry a renewal expiry — a one-off
      // dated session isn't a subscription.
      if (appts[0]?.isBundle) {
        let validDays = 30;
        if (appts[0].bundleId) {
          const bundle = await Bundle.findById(appts[0].bundleId);
          if (bundle?.validDays) validDays = bundle.validDays;
        }
        apptUpdate = {
          ...apptUpdate,
          expiresAt: new Date(paidAt.getTime() + validDays * 24 * 60 * 60 * 1000),
          accessStatus: 'active', renewalReminderSentAt: null,
        };
      }
      await Appointment.updateMany(
        { _id: { $in: appts.map(a => a._id) } },
        apptUpdate
      );
    }
    logActivity(req.user._id, 'payment_success', `Paid $${totalAmount} (${isPurchaseOrder ? 'purchase' : 'appointment'})`, { orderId, totalAmount, transactionId: csTransId });
    return res.json({
      success:       true,
      message:       'Payment successful!',
      transactionId: csTransId,
      amount:        totalAmount,
      paidAt,
      appointments:  isPurchaseOrder ? 0 : appts.length,
      purchases:     isPurchaseOrder ? purchases.length : 0,
      type:          isPurchaseOrder ? 'purchase' : 'appointment',
    });
  }

  /* ── DECLINED / other statuses ──
     CyberSource returns HTTP 201 with status 'DECLINED' and an
     errorInformation.reason for card problems. Map the common reasons
     (especially INSUFFICIENT_FUND) to clear, actionable user messages,
     and mark records 'failed' so the user can retry with another card. */
  const declineReason = csResponse?.errorInformation?.reason || csStatus || 'UNKNOWN';
  const DECLINE_MESSAGES = {
    INSUFFICIENT_FUND:        'Your card has insufficient funds. Please use a different card or add funds and try again.',
    EXPIRED_CARD:             'Your card has expired. Please use a different card.',
    STOLEN_LOST_CARD:         'This card cannot be used. Please contact your bank or use a different card.',
    INVALID_ACCOUNT:          'Card number is not valid. Please check the number and try again.',
    INVALID_CVN:              'The security code (CVV) is incorrect. Please check and try again.',
    CV_FAILED:                'The security code (CVV) did not match. Please check and try again.',
    EXCEEDS_CREDIT_LIMIT:     'This payment exceeds your card limit. Please use a different card.',
    PROCESSOR_DECLINED:       'Your bank declined this payment. Please contact your bank or try another card.',
    ISSUER_UNAVAILABLE:       'Your bank could not be reached. Please try again in a few minutes.',
    DECISION_PROFILE_REJECT:  'This payment was rejected by fraud screening. Please contact us if you believe this is a mistake.',
    BLACKLISTED_CUSTOMER:     'This payment cannot be processed. Please contact us for assistance.',
    PAYMENT_REFUSED:          'Your bank refused this payment. Please contact your bank or try another card.',
  };
  const friendly = DECLINE_MESSAGES[declineReason]
    || `Payment ${String(csStatus || 'failed').toLowerCase()}. Please check your card and try again.`;

  const hadNutrition = isPurchaseOrder ? purchases.some(pc => pc.wantsNutrition) : appts.some(a => a.nutritionAddon);
  console.warn(`[CS] Payment declined — status: ${csStatus}, reason: ${declineReason}, totalAmount: ${totalAmount}, hadNutrition: ${hadNutrition}`);

  if (isPurchaseOrder) {
    await Purchase.updateMany(
      { _id: { $in: purchases.map(pc => pc._id) } },
      { paymentStatus: 'failed' }
    );
  } else {
    await Appointment.updateMany(
      { _id: { $in: appts.map(a => a._id) } },
      { paymentStatus: 'failed' }
    );
  }
  logActivity(req.user._id, 'payment_failed', `Payment of $${totalAmount} declined: ${friendly}`, { orderId, totalAmount, reason: declineReason });
  res.status(402).json({
    success: false,
    message: friendly,
    code:    csStatus,
    reason:  declineReason,
  });
});

/* ══════════════════════════════════════════════════════
   GET /api/payment/status/:orderId
   ══════════════════════════════════════════════════════ */
exports.getPaymentStatus = asyncHandler(async (req, res) => {
  const appts = await Appointment.find({
    user:               req.user._id,
    cyberSourceOrderId: req.params.orderId,
  }).populate('service', 'name');

  if (appts.length === 0)
    return res.status(404).json({ success: false, message: 'Order not found' });

  res.json({
    success:       true,
    orderId:       req.params.orderId,
    status:        appts[0].paymentStatus,
    amount:        appts.reduce((s, a) => s + (a.paidAmount || 0), 0),
    transactionId: appts[0].cyberSourceTransId,
    appointments:  appts,
  });
});

/* Remove the customer's workout/nutrition content that was delivered for a
   refunded sale. Called AFTER the refund is confirmed with CyberSource.
     - Deletes WorkoutPlan(s) linked to that exact (user, service) pair —
       general plans not linked to any service are left untouched.
     - Deletes the user's NutritionPlan only if they have no OTHER remaining
       paid (non-refunded) purchase/appointment that included nutrition. */
async function cleanupAfterRefund({ user, service, wantsNutrition, excludeAppointmentId = null }) {
  if (service) {
    await WorkoutPlan.deleteMany({ user, service });
  }
  if (wantsNutrition) {
    const apptFilter = { user, paymentStatus: 'paid', nutritionAddon: true };
    if (excludeAppointmentId) apptFilter._id = { $ne: excludeAppointmentId };
    const [otherPaidPurchase, otherPaidAppt] = await Promise.all([
      Purchase.findOne({ user, paymentStatus: 'paid', wantsNutrition: true }),
      Appointment.findOne(apptFilter),
    ]);
    if (!otherPaidPurchase && !otherPaidAppt) {
      await NutritionPlan.findOneAndDelete({ user });
    }
  }
}

/* Core refund logic for a single paid appointment — shared by the admin
   "Refund" button (refundPayment below) AND automatic refund-on-reject
   (appointmentController.rejectAppointment). Throws on hard failure
   (network/CyberSource error); returns { refunded:false, ... } if
   CyberSource declines the refund itself. */
async function refundAppointmentCore(appt) {
  if (!appt.isPaid || !appt.cyberSourceTransId)
    return { refunded: false, message: 'No paid online transaction found' };

  const result = await csRequest('POST', `/pts/v2/payments/${appt.cyberSourceTransId}/refunds`, {
    clientReferenceInformation: { code: `refund-${appt._id}` },
    orderInformation: {
      amountDetails: { totalAmount: appt.paidAmount.toFixed(2), currency: 'USD' },
    },
  });

  if (result?.status === 'PENDING') {
    await Appointment.findByIdAndUpdate(appt._id, { paymentStatus: 'refunded', isPaid: false });
    // Only clean up the linked WorkoutPlan if no OTHER paid+non-refunded
    // appointment for the same service remains (protects bundles).
    const otherPaidAppt = await Appointment.findOne({
      user: appt.user, service: appt.service, paymentStatus: 'paid', _id: { $ne: appt._id },
    });
    await cleanupAfterRefund({
      user: appt.user, service: otherPaidAppt ? null : appt.service,
      wantsNutrition: appt.nutritionAddon, excludeAppointmentId: appt._id,
    });
    logActivity(appt.user, 'refund', `Refund initiated for a session ($${appt.paidAmount})`, { appointmentId: appt._id });
    return { refunded: true, refundId: result.id };
  }

  return { refunded: false, message: 'Refund not approved', data: result };
}
exports.refundAppointmentCore = refundAppointmentCore;

/* ══════════════════════════════════════════════════════
   POST /api/payment/refund/:appointmentId  (admin only)
   ══════════════════════════════════════════════════════ */
exports.refundPayment = asyncHandler(async (req, res) => {
  const appt = await Appointment.findById(req.params.appointmentId);
  if (!appt)
    return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (!appt.isPaid || !appt.cyberSourceTransId)
    return res.status(400).json({ success: false, message: 'No paid online transaction found' });

  try {
    const result = await refundAppointmentCore(appt);
    if (result.refunded)
      return res.json({ success: true, message: 'Refund initiated', refundId: result.refundId });
    res.status(400).json({ success: false, message: result.message || 'Refund not approved', data: result.data });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Refund error: ' + (err?.response?.data?.message || err.message),
    });
  }
});

/* ══════════════════════════════════════════════════════
   POST /api/payment/refund-purchase/:purchaseId  (admin only)
   Same as refundPayment but for Purchase records (self-training/custom).
   ══════════════════════════════════════════════════════ */
exports.refundPurchase = asyncHandler(async (req, res) => {
  const purchase = await Purchase.findById(req.params.purchaseId);
  if (!purchase)
    return res.status(404).json({ success: false, message: 'Purchase not found' });
  if (purchase.paymentStatus !== 'paid' || !purchase.cyberSourceTransId)
    return res.status(400).json({ success: false, message: 'No paid online transaction found' });

  try {
    const result = await csRequest('POST', `/pts/v2/payments/${purchase.cyberSourceTransId}/refunds`, {
      clientReferenceInformation: { code: `refund-${purchase._id}` },
      orderInformation: {
        amountDetails: { totalAmount: Number(purchase.amount).toFixed(2), currency: 'USD' },
      },
    });

    if (result?.status === 'PENDING') {
      await Purchase.findByIdAndUpdate(purchase._id, { paymentStatus: 'refunded' });
      await cleanupAfterRefund({
        user: purchase.user, service: purchase.service, wantsNutrition: purchase.wantsNutrition,
      });
      logActivity(purchase.user, 'refund', `Refund initiated for a purchase ($${purchase.amount})`, { purchaseId: purchase._id });
      return res.json({ success: true, message: 'Refund initiated', refundId: result.id });
    }

    res.status(400).json({ success: false, message: 'Refund not approved', data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Refund error: ' + (err?.response?.data?.message || err.message),
    });
  }
});
