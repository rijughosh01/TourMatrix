const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Destination = require("../models/Destination");
const Booking = require("../models/Booking");
const { authRequired, optionalAuth } = require("../middleware/auth");

const router = express.Router();
const RAZORPAY_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RAZORPAY_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const razorpay =
  RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      })
    : null;

function makeRef() {
  return (
    "WLX-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomBytes(3).toString("hex").toUpperCase()
  );
}

function optionFees(checkout) {
  if (!checkout || typeof checkout !== "object") return 0;
  return (checkout.insurance ? 120 : 0) + (checkout.transfer ? 90 : 0);
}

function isValidDateInput(value) {
  if (!value || typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function normalizeCheckoutPatch(input) {
  const errors = [];
  const next = {};
  const patch = input && typeof input === "object" ? input : {};
  const keys = Object.keys(patch);
  const allowed = ["start", "end", "adults", "children", "insurance", "transfer"];

  keys.forEach(function (k) {
    if (allowed.indexOf(k) === -1) {
      errors.push("Unknown field: " + k);
    }
  });

  if (Object.prototype.hasOwnProperty.call(patch, "start")) {
    if (!isValidDateInput(patch.start)) errors.push("start must be a valid date");
    else next.start = String(patch.start).trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "end")) {
    if (!isValidDateInput(patch.end)) errors.push("end must be a valid date");
    else next.end = String(patch.end).trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, "adults")) {
    const adults = Number(patch.adults);
    if (!Number.isInteger(adults) || adults < 1 || adults > 12) {
      errors.push("adults must be an integer between 1 and 12");
    } else {
      next.adults = adults;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "children")) {
    const children = Number(patch.children);
    if (!Number.isInteger(children) || children < 0 || children > 12) {
      errors.push("children must be an integer between 0 and 12");
    } else {
      next.children = children;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "insurance")) {
    if (typeof patch.insurance !== "boolean") errors.push("insurance must be boolean");
    else next.insurance = patch.insurance;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "transfer")) {
    if (typeof patch.transfer !== "boolean") errors.push("transfer must be boolean");
    else next.transfer = patch.transfer;
  }

  return { errors, patch: next };
}

function canMutateBooking(req, booking) {
  if (!booking.user) return true;
  return !!(req.user && booking.user.toString() === req.user._id.toString());
}

function checkoutHasRequiredFields(checkout) {
  if (!checkout || typeof checkout !== "object") return false;
  if (!isValidDateInput(checkout.start) || !isValidDateInput(checkout.end)) return false;
  const adults = Number(checkout.adults);
  const children = Number(checkout.children || 0);
  if (!Number.isInteger(adults) || adults < 1) return false;
  if (!Number.isInteger(children) || children < 0) return false;
  return true;
}

router.post("/start", optionalAuth, async function (req, res) {
  const slug = (req.body.destinationSlug || req.body.id || "").trim();
  if (!slug) {
    return res.status(400).json({ error: "destinationSlug is required" });
  }
  try {
    const dest = await Destination.findOne({ slug }).lean();
    if (!dest) {
      return res.status(404).json({ error: "Destination not found" });
    }
    let ref = makeRef();
    let exists = await Booking.findOne({ ref });
    while (exists) {
      ref = makeRef();
      exists = await Booking.findOne({ ref });
    }
    const booking = await Booking.create({
      ref,
      user: req.user ? req.user._id : null,
      destinationSlug: slug,
      status: "draft",
      checkout: {},
      packagePrice: dest.price || 0,
      depositPercent: dest.depositPercent != null ? dest.depositPercent : 0.2,
    });
    res.status(201).json({
      ref: booking.ref,
      id: slug,
      destinationSlug: slug,
      createdAt: booking.createdAt,
    });
  } catch (e) {
    console.error("[bookings/start]", e);
    res.status(500).json({ error: "Could not start booking" });
  }
});

router.get("/ref/:ref", async function (req, res) {
  try {
    const booking = await Booking.findOne({ ref: req.params.ref })
      .populate("user", "email fullName")
      .lean();
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    const dest = await Destination.findOne({ slug: booking.destinationSlug }).lean();
    res.json({
      booking: {
        ref: booking.ref,
        status: booking.status,
        destinationSlug: booking.destinationSlug,
        checkout: booking.checkout || {},
        receiptEmail: booking.receiptEmail,
        deposit: booking.deposit,
        total: booking.total,
        optionsFees: booking.optionsFees,
        packagePrice: booking.packagePrice,
        paidAt: booking.paidAt,
        createdAt: booking.createdAt,
      },
      destination: dest
        ? (function () {
            const { slug, _id, __v, createdAt, updatedAt, ...rest } = dest;
            return rest;
          })()
        : null,
    });
  } catch (e) {
    console.error("[bookings/ref]", e);
    res.status(500).json({ error: "Failed to load booking" });
  }
});

router.patch("/ref/:ref/checkout", optionalAuth, async function (req, res) {
  try {
    const booking = await Booking.findOne({ ref: req.params.ref });
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    if (booking.status === "paid") {
      return res.status(400).json({ error: "Booking already paid" });
    }
    if (!canMutateBooking(req, booking)) {
      return res.status(403).json({ error: "You are not allowed to modify this booking" });
    }
    const normalized = normalizeCheckoutPatch(req.body);
    if (normalized.errors.length > 0) {
      return res.status(400).json({ error: "Invalid checkout payload", details: normalized.errors });
    }
    const next = Object.assign({}, booking.checkout || {});
    Object.keys(normalized.patch).forEach(function (k) {
      next[k] = normalized.patch[k];
    });
    if (next.start && next.end && new Date(next.end) < new Date(next.start)) {
      return res.status(400).json({ error: "end date must be after start date" });
    }
    booking.checkout = next;
    booking.status = "checkout";
    if (req.user && !booking.user) {
      booking.user = req.user._id;
    }
    const dest = await Destination.findOne({ slug: booking.destinationSlug }).lean();
    const pkg = dest && dest.price != null ? dest.price : booking.packagePrice;
    const opts = optionFees(next);
    booking.packagePrice = pkg;
    booking.optionsFees = opts;
    booking.total = pkg + opts;
    booking.deposit = Math.round(booking.total * (booking.depositPercent || 0.2));
    await booking.save();
    res.json({
      ref: booking.ref,
      checkout: booking.checkout,
      packagePrice: booking.packagePrice,
      optionsFees: booking.optionsFees,
      total: booking.total,
      deposit: booking.deposit,
    });
  } catch (e) {
    console.error("[bookings/checkout]", e);
    res.status(500).json({ error: "Failed to update checkout" });
  }
});

router.post("/ref/:ref/pay", optionalAuth, async function (req, res) {
  try {
    const booking = await Booking.findOne({ ref: req.params.ref });
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    if (booking.status === "paid") {
      return res.status(400).json({ error: "Already paid" });
    }
    if (!canMutateBooking(req, booking)) {
      return res.status(403).json({ error: "You are not allowed to pay for this booking" });
    }
    if (!checkoutHasRequiredFields(booking.checkout)) {
      return res.status(400).json({ error: "Complete checkout details before payment" });
    }
    if (!razorpay) {
      return res.status(503).json({ error: "Razorpay is not configured on server" });
    }
    const receiptEmail = (req.body.receiptEmail || "").trim();
    const razorpayOrderId = (req.body.razorpayOrderId || "").trim();
    const razorpayPaymentId = (req.body.razorpayPaymentId || "").trim();
    const razorpaySignature = (req.body.razorpaySignature || "").trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(receiptEmail);
    if (!emailOk || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        error: "receiptEmail, razorpayOrderId, razorpayPaymentId and razorpaySignature required",
      });
    }
    if (booking.razorpayOrderId && booking.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ error: "Razorpay order does not match this booking" });
    }
    const expectedSig = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(razorpayOrderId + "|" + razorpayPaymentId)
      .digest("hex");
    if (expectedSig !== razorpaySignature) {
      return res.status(400).json({ error: "Invalid Razorpay signature" });
    }
    const dest = await Destination.findOne({ slug: booking.destinationSlug }).lean();
    const pkg = dest && dest.price != null ? dest.price : booking.packagePrice;
    const opts = optionFees(booking.checkout);
    booking.packagePrice = pkg;
    booking.optionsFees = opts;
    booking.total = pkg + opts;
    booking.deposit = Math.round(booking.total * (booking.depositPercent || 0.2));
    booking.receiptEmail = receiptEmail;
    booking.razorpayOrderId = razorpayOrderId;
    booking.razorpayPaymentId = razorpayPaymentId;
    booking.razorpaySignature = razorpaySignature;
    booking.paidAt = new Date();
    booking.status = "paid";
    if (req.user && !booking.user) {
      booking.user = req.user._id;
    }
    await booking.save();
    res.json({
      ref: booking.ref,
      deposit: booking.deposit,
      paidAt: booking.paidAt,
      receiptEmail: booking.receiptEmail,
      razorpayPaymentId: booking.razorpayPaymentId,
    });
  } catch (e) {
    console.error("[bookings/payment-verify]", e);
    res.status(500).json({ error: "Payment recording failed" });
  }
});

router.post("/ref/:ref/razorpay-order", optionalAuth, async function (req, res) {
  try {
    if (!razorpay) {
      return res.status(503).json({ error: "Razorpay is not configured on server" });
    }
    const booking = await Booking.findOne({ ref: req.params.ref });
    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }
    if (booking.status === "paid") {
      return res.status(400).json({ error: "Booking already paid" });
    }
    if (!canMutateBooking(req, booking)) {
      return res.status(403).json({ error: "You are not allowed to pay for this booking" });
    }
    if (!checkoutHasRequiredFields(booking.checkout)) {
      return res.status(400).json({ error: "Complete checkout details before payment" });
    }

    const dest = await Destination.findOne({ slug: booking.destinationSlug }).lean();
    const pkg = dest && dest.price != null ? dest.price : booking.packagePrice;
    const opts = optionFees(booking.checkout);
    booking.packagePrice = pkg;
    booking.optionsFees = opts;
    booking.total = pkg + opts;
    booking.deposit = Math.round(booking.total * (booking.depositPercent || 0.2));

    const order = await razorpay.orders.create({
      amount: booking.deposit * 100,
      currency: "INR",
      receipt: booking.ref,
      notes: {
        bookingRef: booking.ref,
        destinationSlug: booking.destinationSlug,
      },
    });

    booking.razorpayOrderId = order.id;
    await booking.save();

    res.json({
      keyId: RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingRef: booking.ref,
      deposit: booking.deposit,
    });
  } catch (e) {
    console.error("[bookings/razorpay-order]", e);
    res.status(500).json({ error: "Could not create Razorpay order" });
  }
});

router.get("/my", authRequired, async function (req, res) {
  try {
    const list = await Booking.find({ user: req.user._id, status: "paid" })
      .sort({ paidAt: -1 })
      .lean();
    const destMap = {};
    const slugs = [];
    list.forEach(function (b) {
      if (b.destinationSlug && slugs.indexOf(b.destinationSlug) === -1) {
        slugs.push(b.destinationSlug);
      }
    });
    const dests = await Destination.find({ slug: { $in: slugs } }).lean();
    dests.forEach(function (d) {
      destMap[d.slug] = d.title;
    });
    const items = list.map(function (b) {
      return {
        ref: b.ref,
        destinationSlug: b.destinationSlug,
        title: destMap[b.destinationSlug] || b.destinationSlug,
        deposit: b.deposit,
        paidAt: b.paidAt,
        receiptEmail: b.receiptEmail,
        checkout: b.checkout || {},
      };
    });
    res.json({ bookings: items });
  } catch (e) {
    console.error("[bookings/list]", e);
    res.status(500).json({ error: "Failed to load bookings" });
  }
});

module.exports = router;
