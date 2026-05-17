/**
 * Loads data/catalog.json (generated from js/trip-data.js) and upserts Destination docs.
 * Run: npm run seed
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Destination = require("../src/models/Destination");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wanderlux";

async function run() {
  const catalogPath = path.join(__dirname, "..", "data", "catalog.json");
  if (!fs.existsSync(catalogPath)) {
    console.error("Missing", catalogPath, "— run from repo root or generate catalog first.");
    process.exit(1);
  }
  const raw = fs.readFileSync(catalogPath, "utf8");
  const catalog = JSON.parse(raw);

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  let count = 0;
  for (const slug of Object.keys(catalog)) {
    const data = catalog[slug];
    await Destination.findOneAndUpdate(
      { slug },
      Object.assign({}, data, { slug }),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count++;
    console.log("Upserted:", slug);
  }

  console.log("Done. Destinations upserted:", count);
  await mongoose.disconnect();
}

run().catch(function (e) {
  console.error(e);
  process.exit(1);
});
