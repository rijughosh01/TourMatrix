require("dotenv").config();
const bcrypt = require("bcryptjs");
const { connectDb } = require("../src/config/db");
const User = require("../src/models/User");

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/wanderlux";
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const fullName = String(process.env.ADMIN_NAME || "WanderLux Admin").trim();

  if (!email || !password || password.length < 8) {
    throw new Error("Set ADMIN_EMAIL, ADMIN_PASSWORD (min 8), and ADMIN_NAME in .env");
  }

  await connectDb(uri);
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (!existing) {
    await User.create({
      email,
      fullName,
      passwordHash,
      role: "admin",
      isActive: true,
      lastLoginAt: null,
      savedSlugs: [],
    });
    console.log("Admin user created:", email);
  } else {
    existing.fullName = fullName || existing.fullName;
    existing.passwordHash = passwordHash;
    existing.role = "admin";
    existing.isActive = true;
    await existing.save();
    console.log("Admin user updated:", email);
  }
}

main()
  .then(function () {
    process.exit(0);
  })
  .catch(function (e) {
    console.error(e.message || e);
    process.exit(1);
  });
