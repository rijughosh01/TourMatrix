const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    destinationSlug: { type: String, required: true },
    status: {
      type: String,
      enum: ["draft", "checkout", "paid", "cancelled"],
      default: "draft",
    },
    checkout: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    receiptEmail: { type: String, default: "" },
    cardLast4: { type: String, default: "" },
    cardName: { type: String, default: "" },
    packagePrice: { type: Number, default: 0 },
    optionsFees: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    deposit: { type: Number, default: 0 },
    depositPercent: { type: Number, default: 0.2, min: 0, max: 1 },
    paidAt: { type: Date, default: null },
    razorpayOrderId: { type: String, default: "" },
    razorpayPaymentId: { type: String, default: "" },
    razorpaySignature: { type: String, default: "" },
    adminPaymentNote: { type: String, default: "" },
    refundStatus: {
      type: String,
      enum: ["none", "requested", "processing", "completed", "rejected"],
      default: "none",
      index: true,
    },
    paymentVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
