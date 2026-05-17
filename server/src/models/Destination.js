const mongoose = require("mongoose");

const faqItemSchema = new mongoose.Schema(
  { q: String, a: String },
  { _id: false }
);

const destinationSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    title: String,
    price: Number,
    depositPercent: Number,
    desc: String,
    image: String,
    imageAlt: String,
    region: String,
    styles: [String],
    nights: Number,
    rating: Number,
    popularity: Number,
    budgetTier: String,
    timezone: String,
    bestSeason: String,
    lat: Number,
    lng: Number,
    included: [String],
    notIncluded: [String],
    faq: [faqItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Destination", destinationSchema);
