const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { body, query, validationResult } = require("express-validator");

const { adminRequired } = require("../middleware/auth");
const User = require("../models/User");
const Destination = require("../models/Destination");
const Booking = require("../models/Booking");
const ContactMessage = require("../models/ContactMessage");
const AppointmentRequest = require("../models/AppointmentRequest");
const AdminAuditLog = require("../models/AdminAuditLog");

const router = express.Router();

const DESTINATION_FIELDS = [
  "slug",
  "title",
  "price",
  "depositPercent",
  "desc",
  "image",
  "imageAlt",
  "region",
  "styles",
  "nights",
  "rating",
  "popularity",
  "budgetTier",
  "timezone",
  "bestSeason",
  "lat",
  "lng",
  "included",
  "notIncluded",
  "faq",
];

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype || file.mimetype.indexOf("image/") !== 0) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});

function cloudinaryConfigured() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function toStringList(value) {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    return value.map(function (s) {
      return String(s).trim();
    }).filter(Boolean);
  }
  return String(value)
    .split(/[\r\n,]+/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

function toFaqList(value) {
  if (value == null || value === "") return undefined;
  if (Array.isArray(value)) {
    return value
      .map(function (item) {
        if (!item || typeof item !== "object") return null;
        var q = String(item.q || "").trim();
        var a = String(item.a || "").trim();
        if (!q || !a) return null;
        return { q: q, a: a };
      })
      .filter(Boolean);
  }
  return String(value)
    .split(/\r?\n/)
    .map(function (line) {
      var parts = line.split("|");
      if (parts.length < 2) return null;
      var q = parts[0].trim();
      var a = parts.slice(1).join("|").trim();
      if (!q || !a) return null;
      return { q: q, a: a };
    })
    .filter(Boolean);
}

function normalizeDestinationBody(body) {
  var raw = {};
  DESTINATION_FIELDS.forEach(function (k) {
    if (Object.prototype.hasOwnProperty.call(body, k)) {
      raw[k] = body[k];
    }
  });
  var out = {};
  if (raw.slug != null) out.slug = String(raw.slug).trim().toLowerCase();
  if (raw.title != null) out.title = String(raw.title).trim();
  if (raw.desc != null) out.desc = String(raw.desc).trim();
  if (raw.image != null) out.image = String(raw.image).trim();
  if (raw.imageAlt != null) out.imageAlt = String(raw.imageAlt).trim();
  if (raw.region != null) out.region = String(raw.region).trim();
  if (raw.budgetTier != null) out.budgetTier = String(raw.budgetTier).trim();
  if (raw.timezone != null) out.timezone = String(raw.timezone).trim();
  if (raw.bestSeason != null) out.bestSeason = String(raw.bestSeason).trim();
  if (raw.price != null && raw.price !== "") out.price = Number(raw.price);
  if (raw.depositPercent != null && raw.depositPercent !== "") out.depositPercent = Number(raw.depositPercent);
  if (raw.nights != null && raw.nights !== "") out.nights = Number(raw.nights);
  if (raw.rating != null && raw.rating !== "") out.rating = Number(raw.rating);
  if (raw.popularity != null && raw.popularity !== "") out.popularity = Number(raw.popularity);
  if (raw.lat != null && raw.lat !== "") out.lat = Number(raw.lat);
  if (raw.lng != null && raw.lng !== "") out.lng = Number(raw.lng);
  var styles = toStringList(raw.styles);
  if (styles) out.styles = styles;
  var inc = toStringList(raw.included);
  if (inc) out.included = inc;
  var exc = toStringList(raw.notIncluded);
  if (exc) out.notIncluded = exc;
  var faq = toFaqList(raw.faq);
  if (faq) out.faq = faq;
  return out;
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Validation failed", details: errors.array() });
    return false;
  }
  return true;
}

function toPage(v, fallback) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

async function writeAudit(req, action, targetType, targetId, summary, before, after) {
  try {
    await AdminAuditLog.create({
      actorUserId: req.user._id,
      actorEmail: req.user.email,
      action,
      targetType,
      targetId: String(targetId),
      summary: summary || "",
      before: before || null,
      after: after || null,
    });
  } catch (_) {
    /* audit failures should not break API response */
  }
}

router.get("/upload-config", adminRequired, function (req, res) {
  res.json({
    configured: cloudinaryConfigured(),
    hint: cloudinaryConfigured()
      ? "Ready for image uploads"
      : "Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to server .env",
  });
});

router.post(
  "/upload-image",
  adminRequired,
  function (req, res, next) {
    uploadImage.single("image")(req, res, function (err) {
      if (err) {
        return res.status(400).json({ error: err.message || "Invalid upload" });
      }
      next();
    });
  },
  async function (req, res) {
    if (!cloudinaryConfigured()) {
      return res.status(503).json({
        error:
          "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in server .env",
      });
    }
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No image file provided (field name: image)" });
    }
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    var folder = (process.env.CLOUDINARY_UPLOAD_FOLDER || "wanderlux/destinations").replace(/^\/+|\/+$/g, "");
    try {
      var result = await new Promise(function (resolve, reject) {
        var stream = cloudinary.uploader.upload_stream(
          {
            folder: folder,
            resource_type: "image",
            use_filename: true,
            unique_filename: true,
          },
          function (err, uploaded) {
            if (err) reject(err);
            else resolve(uploaded);
          }
        );
        stream.end(req.file.buffer);
      });
      await writeAudit(req, "media.upload", "cloudinary", result.public_id || "", "Uploaded destination image", null, {
        publicId: result.public_id,
      });
      res.json({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      });
    } catch (e) {
      console.error("[admin] Cloudinary upload", e);
      res.status(502).json({ error: "Image upload to Cloudinary failed" });
    }
  }
);

router.get("/stats", adminRequired, async function (req, res) {
  try {
    const [usersTotal, adminsTotal, activeUsers, destinationsTotal, bookingsTotal, paidBookings, contactsTotal, appointmentsTotal] =
      await Promise.all([
        User.countDocuments({}),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({ isActive: true }),
        Destination.countDocuments({}),
        Booking.countDocuments({}),
        Booking.countDocuments({ status: "paid" }),
        ContactMessage.countDocuments({}),
        AppointmentRequest.countDocuments({}),
      ]);

    const payments = await Booking.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          totalDeposits: { $sum: "$deposit" },
          totalOrderValue: { $sum: "$total" },
        },
      },
    ]);

    const paymentTotals = payments[0] || { totalDeposits: 0, totalOrderValue: 0 };
    res.json({
      stats: {
        usersTotal,
        adminsTotal,
        activeUsers,
        destinationsTotal,
        bookingsTotal,
        paidBookings,
        contactsTotal,
        appointmentsTotal,
        totalDeposits: paymentTotals.totalDeposits || 0,
        totalOrderValue: paymentTotals.totalOrderValue || 0,
      },
    });
  } catch (_) {
    res.status(500).json({ error: "Failed to load admin stats" });
  }
});

router.get(
  "/users",
  adminRequired,
  [
    query("page").optional().isInt({ min: 1 }),
    query("pageSize").optional().isInt({ min: 1, max: 100 }),
  ],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const page = toPage(req.query.page, 1);
      const pageSize = toPage(req.query.pageSize, 20);
      const skip = (page - 1) * pageSize;
      const [items, total] = await Promise.all([
        User.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        User.countDocuments({}),
      ]);
      res.json({
        users: items.map(function (u) {
          return {
            id: String(u._id),
            email: u.email,
            fullName: u.fullName,
            role: u.role || "customer",
            isActive: u.isActive !== false,
            lastLoginAt: u.lastLoginAt || null,
            createdAt: u.createdAt,
          };
        }),
        pagination: { page, pageSize, total },
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to list users" });
    }
  }
);

router.patch(
  "/users/:id/role",
  adminRequired,
  [body("role").isIn(["customer", "admin"])],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const target = await User.findById(req.params.id);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }
      const nextRole = req.body.role;
      if (target._id.toString() === req.user._id.toString() && nextRole !== "admin") {
        return res.status(400).json({ error: "You cannot remove your own admin role" });
      }
      if (target.role === "admin" && nextRole !== "admin") {
        const activeAdmins = await User.countDocuments({ role: "admin", isActive: true });
        if (activeAdmins <= 1) {
          return res.status(400).json({ error: "At least one active admin is required" });
        }
      }
      const before = { role: target.role || "customer" };
      target.role = nextRole;
      await target.save();
      await writeAudit(
        req,
        "user.role.update",
        "user",
        target._id.toString(),
        "Updated user role",
        before,
        { role: target.role }
      );
      res.json({ ok: true, user: target.toPublicJSON() });
    } catch (_) {
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

router.patch(
  "/users/:id/status",
  adminRequired,
  [body("isActive").isBoolean()],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const target = await User.findById(req.params.id);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }
      const nextActive = !!req.body.isActive;
      if (target._id.toString() === req.user._id.toString() && !nextActive) {
        return res.status(400).json({ error: "You cannot deactivate your own account" });
      }
      if (target.role === "admin" && !nextActive) {
        const activeAdmins = await User.countDocuments({ role: "admin", isActive: true });
        if (activeAdmins <= 1) {
          return res.status(400).json({ error: "At least one active admin is required" });
        }
      }
      const before = { isActive: target.isActive !== false };
      target.isActive = nextActive;
      await target.save();
      await writeAudit(
        req,
        "user.status.update",
        "user",
        target._id.toString(),
        "Updated user active status",
        before,
        { isActive: target.isActive }
      );
      res.json({ ok: true, user: target.toPublicJSON() });
    } catch (_) {
      res.status(500).json({ error: "Failed to update status" });
    }
  }
);

router.get(
  "/destinations",
  adminRequired,
  [query("page").optional().isInt({ min: 1 }), query("pageSize").optional().isInt({ min: 1, max: 100 })],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const page = toPage(req.query.page, 1);
      const pageSize = toPage(req.query.pageSize, 20);
      const skip = (page - 1) * pageSize;
      const [destinations, total] = await Promise.all([
        Destination.find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        Destination.countDocuments({}),
      ]);
      res.json({ destinations, pagination: { page, pageSize, total } });
    } catch (_) {
      res.status(500).json({ error: "Failed to load destinations" });
    }
  }
);

router.post("/destinations", adminRequired, async function (req, res) {
  try {
    const updates = normalizeDestinationBody(req.body);
    if (!updates.slug || !updates.title || updates.price == null || Number.isNaN(updates.price)) {
      return res.status(400).json({ error: "slug, title, and numeric price are required" });
    }
    if (updates.depositPercent == null || Number.isNaN(updates.depositPercent)) {
      updates.depositPercent = 0.2;
    }
    const exists = await Destination.findOne({ slug: updates.slug }).lean();
    if (exists) {
      return res.status(409).json({ error: "Destination slug already exists" });
    }
    const created = await Destination.create(updates);
    await writeAudit(
      req,
      "destination.create",
      "destination",
      created.slug,
      "Created destination",
      null,
      { slug: created.slug, title: created.title }
    );
    res.status(201).json({ destination: created });
  } catch (_) {
    res.status(500).json({ error: "Failed to create destination" });
  }
});

router.patch("/destinations/:slug", adminRequired, async function (req, res) {
  try {
    const destination = await Destination.findOne({ slug: req.params.slug });
    if (!destination) {
      return res.status(404).json({ error: "Destination not found" });
    }
    const before = { slug: destination.slug, title: destination.title, price: destination.price };
    const updates = normalizeDestinationBody(req.body);
    if (updates.slug && updates.slug !== destination.slug) {
      const clash = await Destination.findOne({ slug: updates.slug }).lean();
      if (clash && String(clash._id) !== String(destination._id)) {
        return res.status(409).json({ error: "Destination slug already exists" });
      }
    }
    Object.keys(updates).forEach(function (k) {
      destination[k] = updates[k];
    });
    await destination.save();
    await writeAudit(
      req,
      "destination.update",
      "destination",
      destination.slug,
      "Updated destination",
      before,
      { slug: destination.slug, title: destination.title, price: destination.price }
    );
    res.json({ destination });
  } catch (_) {
    res.status(500).json({ error: "Failed to update destination" });
  }
});

router.delete("/destinations/:slug", adminRequired, async function (req, res) {
  try {
    const deleted = await Destination.findOneAndDelete({ slug: req.params.slug });
    if (!deleted) {
      return res.status(404).json({ error: "Destination not found" });
    }
    await writeAudit(
      req,
      "destination.delete",
      "destination",
      deleted.slug,
      "Deleted destination",
      { slug: deleted.slug, title: deleted.title },
      null
    );
    res.json({ ok: true });
  } catch (_) {
    res.status(500).json({ error: "Failed to delete destination" });
  }
});

router.get(
  "/bookings",
  adminRequired,
  [
    query("status").optional().isIn(["draft", "checkout", "paid", "cancelled"]),
    query("destinationSlug").optional().isString(),
    query("from").optional().isString(),
    query("to").optional().isString(),
    query("page").optional().isInt({ min: 1 }),
    query("pageSize").optional().isInt({ min: 1, max: 100 }),
  ],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const page = toPage(req.query.page, 1);
      const pageSize = toPage(req.query.pageSize, 20);
      const skip = (page - 1) * pageSize;
      const where = {};
      if (req.query.status) where.status = req.query.status;
      if (req.query.destinationSlug) where.destinationSlug = req.query.destinationSlug;
      if (req.query.from || req.query.to) {
        where.createdAt = {};
        if (req.query.from) where.createdAt.$gte = new Date(req.query.from);
        if (req.query.to) where.createdAt.$lte = new Date(req.query.to);
      }
      const [bookings, total] = await Promise.all([
        Booking.find(where)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .populate("user", "email fullName role")
          .lean(),
        Booking.countDocuments(where),
      ]);
      res.json({ bookings, pagination: { page, pageSize, total } });
    } catch (_) {
      res.status(500).json({ error: "Failed to list bookings" });
    }
  }
);

router.patch(
  "/bookings/:ref/status",
  adminRequired,
  [
    body("status").optional({ checkFalsy: true }).isIn(["draft", "checkout", "paid", "cancelled"]),
    body("refundStatus").optional({ checkFalsy: true }).isIn(["none", "requested", "processing", "completed", "rejected"]),
    body("adminPaymentNote").optional().isString(),
  ],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const booking = await Booking.findOne({ ref: req.params.ref });
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      const before = {
        status: booking.status,
        refundStatus: booking.refundStatus || "none",
        adminPaymentNote: booking.adminPaymentNote || "",
      };
      if (req.body.status) booking.status = req.body.status;
      if (req.body.refundStatus) booking.refundStatus = req.body.refundStatus;
      if (typeof req.body.adminPaymentNote === "string") {
        booking.adminPaymentNote = req.body.adminPaymentNote.trim();
      }
      booking.paymentVerifiedBy = req.user._id;
      await booking.save();
      await writeAudit(
        req,
        "booking.payment.update",
        "booking",
        booking.ref,
        "Updated booking payment controls",
        before,
        {
          status: booking.status,
          refundStatus: booking.refundStatus || "none",
          adminPaymentNote: booking.adminPaymentNote || "",
        }
      );
      res.json({ booking });
    } catch (_) {
      res.status(500).json({ error: "Failed to update booking" });
    }
  }
);

router.get(
  "/audit-logs",
  adminRequired,
  [query("page").optional().isInt({ min: 1 }), query("pageSize").optional().isInt({ min: 1, max: 100 })],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const page = toPage(req.query.page, 1);
      const pageSize = toPage(req.query.pageSize, 20);
      const skip = (page - 1) * pageSize;
      const [logs, total] = await Promise.all([
        AdminAuditLog.find({})
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(pageSize)
          .lean(),
        AdminAuditLog.countDocuments({}),
      ]);
      res.json({ logs, pagination: { page, pageSize, total } });
    } catch (_) {
      res.status(500).json({ error: "Failed to load audit logs" });
    }
  }
);

router.get(
  "/contact-messages",
  adminRequired,
  [query("page").optional().isInt({ min: 1 }), query("pageSize").optional().isInt({ min: 1, max: 100 })],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const page = toPage(req.query.page, 1);
      const pageSize = toPage(req.query.pageSize, 20);
      const skip = (page - 1) * pageSize;
      const [messages, total] = await Promise.all([
        ContactMessage.find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        ContactMessage.countDocuments({}),
      ]);
      res.json({
        messages: messages.map(function (m) {
          return {
            id: String(m._id),
            name: m.name,
            email: m.email,
            topic: m.topic,
            message: m.message,
            createdAt: m.createdAt,
          };
        }),
        pagination: { page, pageSize, total },
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to load contact messages" });
    }
  }
);

router.get(
  "/appointment-requests",
  adminRequired,
  [query("page").optional().isInt({ min: 1 }), query("pageSize").optional().isInt({ min: 1, max: 100 })],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const page = toPage(req.query.page, 1);
      const pageSize = toPage(req.query.pageSize, 20);
      const skip = (page - 1) * pageSize;
      const [requests, total] = await Promise.all([
        AppointmentRequest.find({}).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
        AppointmentRequest.countDocuments({}),
      ]);
      res.json({
        appointments: requests.map(function (a) {
          return {
            id: String(a._id),
            fullName: a.fullName,
            email: a.email,
            phone: a.phone,
            preferredDate: a.preferredDate,
            message: a.message,
            createdAt: a.createdAt,
          };
        }),
        pagination: { page, pageSize, total },
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to load appointment requests" });
    }
  }
);

module.exports = router;
