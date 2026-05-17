const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, trim: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    destinationSlug: { type: String, required: true, trim: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120, default: "" },
    body: { type: String, trim: true, maxlength: 2000, default: "" },
    authorName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ bookingRef: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("Review", reviewSchema);
