const express = require("express");
const { body, param, validationResult } = require("express-validator");
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg || "Invalid input" });
    return false;
  }
  return true;
}

function toPublicReview(doc) {
  return {
    id: String(doc._id),
    bookingRef: doc.bookingRef,
    destinationSlug: doc.destinationSlug,
    rating: doc.rating,
    title: doc.title || "",
    body: doc.body || "",
    authorName: doc.authorName,
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

router.get(
  "/destination/:slug",
  [param("slug").trim().isLength({ min: 1, max: 80 })],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const slug = req.params.slug.trim();
      const reviews = await Review.find({ destinationSlug: slug, status: "approved" })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      const agg = await Review.aggregate([
        { $match: { destinationSlug: slug, status: "approved" } },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]);
      const summary =
        agg.length > 0
          ? {
              averageRating: Math.round(agg[0].averageRating * 10) / 10,
              count: agg[0].count,
            }
          : { averageRating: 0, count: 0 };
      res.json({
        reviews: reviews.map(toPublicReview),
        summary: summary,
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to load reviews" });
    }
  }
);

router.get("/my", authRequired, async function (req, res) {
  try {
    const reviews = await Review.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ reviews: reviews.map(toPublicReview) });
  } catch (_) {
    res.status(500).json({ error: "Failed to load your reviews" });
  }
});

router.get(
  "/booking/:ref",
  authRequired,
  [param("ref").trim().isLength({ min: 4, max: 40 })],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const ref = req.params.ref.trim();
      const booking = await Booking.findOne({ ref: ref });
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.user && String(booking.user) !== String(req.user._id)) {
        return res.status(403).json({ error: "Not your booking" });
      }
      if (booking.status !== "paid") {
        return res.json({ canReview: false, reason: "Pay your deposit before leaving a review." });
      }
      const existing = await Review.findOne({ bookingRef: ref, user: req.user._id }).lean();
      res.json({
        canReview: !existing,
        review: existing ? toPublicReview(existing) : null,
        destinationSlug: booking.destinationSlug,
      });
    } catch (_) {
      res.status(500).json({ error: "Failed to check review eligibility" });
    }
  }
);

router.post(
  "/",
  authRequired,
  [
    body("bookingRef").trim().isLength({ min: 4, max: 40 }),
    body("rating").isInt({ min: 1, max: 5 }),
    body("title").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
    body("body").optional({ values: "falsy" }).trim().isLength({ max: 2000 }),
  ],
  async function (req, res) {
    if (!handleValidation(req, res)) return;
    try {
      const bookingRef = req.body.bookingRef.trim();
      const booking = await Booking.findOne({ ref: bookingRef });
      if (!booking) {
        return res.status(404).json({ error: "Booking not found" });
      }
      if (booking.user && String(booking.user) !== String(req.user._id)) {
        return res.status(403).json({ error: "You can only review your own bookings" });
      }
      if (booking.status !== "paid") {
        return res.status(400).json({ error: "Only paid bookings can be reviewed" });
      }
      const existing = await Review.findOne({ bookingRef: bookingRef, user: req.user._id });
      if (existing) {
        return res.status(409).json({ error: "You already submitted a review for this booking" });
      }
      const review = await Review.create({
        bookingRef: bookingRef,
        user: req.user._id,
        destinationSlug: booking.destinationSlug,
        rating: req.body.rating,
        title: (req.body.title || "").trim(),
        body: (req.body.body || "").trim(),
        authorName: req.user.fullName,
        status: "pending",
      });
      res.status(201).json({ review: toPublicReview(review) });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ error: "Review already exists for this booking" });
      }
      res.status(500).json({ error: "Failed to submit review" });
    }
  }
);

module.exports = router;
