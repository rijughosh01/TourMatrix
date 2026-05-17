require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { connectDb } = require("./config/db");

const authRoutes = require("./routes/auth");
const usersRoutes = require("./routes/users");
const destinationsRoutes = require("./routes/destinations");
const bookingsRoutes = require("./routes/bookings");
const contactRoutes = require("./routes/contact");
const adminRoutes = require("./routes/admin");
const reviewsRoutes = require("./routes/reviews");
const aiRoutes = require("./routes/ai");

const PORT = parseInt(process.env.PORT || "5001", 10);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wanderlux";

function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === "*" || raw.trim() === "") {
    return true;
  }
  return raw.split(",").map(function (s) {
    return s.trim();
  }).filter(Boolean);
}

async function main() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.warn(
      "[wanderlux-api] Warning: set JWT_SECRET in .env (min 16 chars) for production."
    );
  }

  await connectDb(MONGODB_URI);
  console.log("[wanderlux-api] MongoDB connected");

  const app = express();
  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later." },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many authentication attempts. Try again later." },
  });
  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many admin requests. Try again later." },
  });
  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many AI requests. Please wait a few minutes." },
  });

  app.use(
    cors({
      origin: parseCorsOrigins(),
      credentials: true,
    })
  );
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/contact", writeLimiter);
  app.use("/api/appointments", writeLimiter);
  app.use("/api/bookings/ref", writeLimiter);
  app.use("/api/auth", authLimiter);
  app.use("/api/admin", adminLimiter);

  /* Root URL — opening http://localhost:5001/ in a browser shows this instead of "Cannot GET /" */
  app.get("/", function (req, res) {
    res.type("json");
    res.json({
      name: "WanderLux API",
      hint: "This is the JSON API only. Open your frontend (e.g. Live Server) separately.",
      health: "/api/health",
      catalog: "/api/destinations/catalog",
    });
  });

  app.get("/api/health", function (req, res) {
    res.json({ ok: true, service: "wanderlux-api", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/destinations", destinationsRoutes);
  app.use("/api/bookings", bookingsRoutes);
  app.use("/api/reviews", reviewsRoutes);
  app.use("/api/ai", aiLimiter, aiRoutes);
  app.use("/api", contactRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(function (req, res, next) {
    if (!req.path.startsWith("/api")) return next();
    res.status(404).json({ error: "API route not found" });
  });

  app.use(function (err, req, res, next) {
    if (!err) return next();
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  app.listen(PORT, function () {
    console.log("[wanderlux-api] Listening on http://localhost:" + PORT);
  });
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
