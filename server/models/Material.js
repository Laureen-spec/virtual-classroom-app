import mongoose from "mongoose";

const materialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "ClassSchedule" }, // optional
  subject: { type: String }, // e.g. Mathematics
  fileUrl: { type: String, required: true }, // local path or S3 URL
  fileName: { type: String },
  fileSize: { type: Number },
  contentType: { type: String },
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("Material", materialSchema);
