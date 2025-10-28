import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phone: { type: String }, // Added for M-Pesa matching
  role: {
    type: String,
    enum: ["admin", "teacher", "student"],
    default: "student",
  },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
});

export default mongoose.model("User", userSchema);