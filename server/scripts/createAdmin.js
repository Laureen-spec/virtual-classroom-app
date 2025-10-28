// server/scripts/createAdmin.js
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

dotenv.config();

const MONGO = process.env.MONGO_URI; // ✅ Force using the same DB as backend
const ADMIN_EMAIL = process.env.INIT_ADMIN_EMAIL || "admin@school.com";
const ADMIN_PASSWORD = process.env.INIT_ADMIN_PASSWORD || "StrongAdmin123!";
const ADMIN_NAME = process.env.INIT_ADMIN_NAME || "School Admin";

async function main() {
  try {
    if (!MONGO) throw new Error("❌ MONGO_URI is missing in .env");

    await mongoose.connect(MONGO);
    console.log("✅ Connected to MongoDB:", MONGO);

    const existing = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
    if (existing) {
      console.log("⚠️ Admin already exists:", existing.email);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const admin = new User({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL.toLowerCase(),
      password: hashed,
      role: "admin",
      phone: "",
    });

    await admin.save();
    console.log("✅ Admin created:", ADMIN_EMAIL);
    console.log("🔑 Password (plain):", ADMIN_PASSWORD);
    console.log("👉 Change this password after first login.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating admin:", err.message);
    process.exit(1);
  }
}

main();
