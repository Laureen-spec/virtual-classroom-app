import mongoose from "mongoose";

const subjectFrequencySchema = new mongoose.Schema({
  subject: { type: String, required: true },
  frequency: { type: Number, required: true, min: 1 }
});

const subscriptionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    subjects: { type: [subjectFrequencySchema], required: true }, // Changed to store subject-frequency pairs
    lessons: { type: Number, required: true }, // Total lessons per week
    amountPaid: { type: Number, required: true },
    phone: { type: String },
    startDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "expired", "pending"], default: "active" },
    transactionId: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model("Subscription", subscriptionSchema);