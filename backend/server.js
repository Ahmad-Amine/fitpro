const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const { errorHandler } = require("./middleware/errorHandler");
const {
  helmetConfig,
  generalLimiter,
  mongoSanitize,
  bodyLimit,
  validateEnv,
} = require("./middleware/security");
const { Appointment, Purchase } = require("./models");

// FIX: validate environment at startup before anything else
validateEnv();

const authRoutes = require("./routes/authRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const availabilityRoutes = require("./routes/availabilityRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const workoutRoutes = require("./routes/workoutRoutes");
const exportRoutes   = require("./routes/exportRoutes");
const paymentRoutes  = require("./routes/paymentRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const webhookRoutes  = require("./routes/webhookRoutes");

const app = express();
app.get("/", (req, res) => res.json({ success: true, message: "API running" }));
app.set("trust proxy", 1);

app.use(helmetConfig);

// ── Security Headers ──────────────────────────────────────
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Force HTTPS for 1 year
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // No referrer info leaked
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Disable dangerous browser features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://flex.cybersource.com" "https://testflex.cybersource.com")');
  // Content Security Policy
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://www.youtube.com https://flex.cybersource.com https://testflex.cybersource.com https://testflex.cybersource.com/microform/bundle/v2.0.2/flex-microform.min.js; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; " +
    "frame-src https://www.youtube.com https://flex.cybersource.com https://testflex.cybersource.com https://*.cybersource.com; " +
    "connect-src 'self' https://zesty-determination-production-83b8.up.railway.app https://fitpro-production-a46e.up.railway.app https://www.aya-fit.com https://flex.cybersource.com https://testflex.cybersource.com https://*.cybersource.com; " +
    "object-src 'none'; " +
    "base-uri 'self';"
  );
  next();
});

/* ── Webhooks (mounted BEFORE CORS) ────────────────────────────
   CyberSource calls this server-to-server with NO Origin header, which the
   production CORS policy below deliberately rejects. Webhooks are therefore
   mounted first and authenticate via HMAC signature instead of CORS/JWT.
   The raw body is captured for signature verification — the signature is
   computed over the exact received bytes, so it must not be re-serialized. */
app.use(
  "/api/webhooks",
  express.json({
    limit: "1mb",
    verify: (req, res, buf) => { req.rawBody = buf.toString("utf8"); },
  }),
  webhookRoutes,
);

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  ...( process.env.ALLOWED_ORIGIN
    ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
    : []
  ),
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

const isProd = process.env.NODE_ENV === "production";

app.use(
  cors({
    origin: (origin, cb) => {
      // In production: reject requests with no Origin (e.g. server-side curl)
      // In dev: allow no-origin so Postman/curl work locally
      if (!origin) {
        return isProd
          ? cb(
              new Error(
                "CORS: direct server-side requests not allowed in production",
              ),
            )
          : cb(null, true);
      }
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // cache preflight 24 h
  }),
);

// Enforce JSON Content-Type on mutation endpoints (POST/PUT/PATCH)
app.use((req, res, next) => {
  const mutates = ["POST", "PUT", "PATCH"];
  if (
    mutates.includes(req.method) &&
    req.headers["content-type"] &&
    !req.headers["content-type"].includes("application/json")
  ) {
    return res
      .status(415)
      .json({
        success: false,
        message: "Content-Type must be application/json",
      });
  }
  next();
});

// ── Body parsing & sanitisation ───────────────────────────────
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));
app.use(mongoSanitize);

// ── Global rate limit ─────────────────────────────────────────
app.use("/api/", generalLimiter);

// ── Dev logging (non-production only) ─────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// ── Database ──────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");
    try {
      const d = await Appointment.removeOldAppointments();
      if (d > 0) console.log(`🧹 Removed ${d} old appointments`);
    } catch {}
    const scheduleCleanup = () => {
      const now = new Date(),
        next = new Date();
      next.setHours(24, 0, 0, 0);
      setTimeout(async () => {
        try {
          await Appointment.removeOldAppointments();
        } catch {}
        scheduleCleanup();
      }, next - now);
    };
    scheduleCleanup();
  })
  .catch((err) => {
    console.error("❌ MongoDB Error:", err.message);
    process.exit(1);
  });

mongoose.connection.on("disconnected", () =>
  console.warn("⚠️ MongoDB disconnected"),
);
mongoose.connection.on("reconnected", () =>
  console.log("✅ MongoDB reconnected"),
);

// ── Routes ────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/workout", workoutRoutes);
app.use("/api/export",       exportRoutes);
app.use("/api/payment",      paymentRoutes);
app.use("/api/purchases",    purchaseRoutes);

// ── Health check — minimal info ───────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: "Not found" }),
);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
// ── Abandoned-booking cleanup ─────────────────────────────────
// Unpaid bookings are invisible to users/admin (they only appear after
// successful payment) but still hold their calendar slot to prevent
// double-booking during checkout. This job:
//   1. releases payments stuck in-flight (pending/capturing > 15 min) → failed
//   2. deletes abandoned online bookings (unpaid/failed > 60 min) to free slots
// Admin phone bookings are never touched.
const { Appointment: CleanupAppt } = require("./models");
async function cleanupAbandonedBookings() {
  try {
    const m15 = new Date(Date.now() - 15 * 60 * 1000);
    const m60 = new Date(Date.now() - 60 * 60 * 1000);
    await CleanupAppt.updateMany(
      { paymentStatus: { $in: ["pending", "capturing"] }, updatedAt: { $lt: m15 }, isPhoneBooking: { $ne: true } },
      { paymentStatus: "failed" }
    );
    const del = await CleanupAppt.deleteMany({
      paymentStatus: { $in: ["unpaid", "failed"] },
      isPhoneBooking: { $ne: true },
      createdAt: { $lt: m60 },
    });
    if (del.deletedCount > 0) console.log(`[cleanup] Removed ${del.deletedCount} abandoned unpaid booking(s)`);
  } catch (e) { console.error("[cleanup] error:", e.message); }
}
setInterval(cleanupAbandonedBookings, 15 * 60 * 1000);
setTimeout(cleanupAbandonedBookings, 30 * 1000); // run shortly after boot

// ── Renewal lifecycle: active -> grace -> expired ─────────────
// Each Purchase / bundle-booking has its own expiresAt (30 days by default,
// or a Bundle's validDays). Grace = 1 extra day of full access after
// expiry. Past grace, accessStatus flips to 'expired' and the customer-
// facing reads (getMyPurchases/getMyAppointments/getMyWorkoutPlans/
// getMyNutrition) stop returning it — nothing is deleted, so a fresh
// payment (accessStatus back to 'active') restores it exactly as it was.
const GRACE_MS = 24 * 60 * 60 * 1000;
async function checkRenewals() {
  try {
    const now = new Date();
    const graceStarts = new Date(now.getTime() - GRACE_MS);
    for (const Model of [Purchase, Appointment]) {
      await Model.updateMany(
        { accessStatus: "active", expiresAt: { $ne: null, $lt: now } },
        { accessStatus: "grace" }
      );
      await Model.updateMany(
        { accessStatus: "grace", expiresAt: { $ne: null, $lt: graceStarts } },
        { accessStatus: "expired" }
      );
    }
  } catch (e) { console.error("[renewals] error:", e.message); }
}
setInterval(checkRenewals, 60 * 60 * 1000);
setTimeout(checkRenewals, 45 * 1000); // run shortly after boot

app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason?.message || reason);
  // Do NOT crash — log and continue
});
