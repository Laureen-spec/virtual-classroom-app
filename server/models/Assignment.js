import mongoose from "mongoose";

const assignmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional link to User model
  teacherName: { type: String, required: true }, // new field for direct teacher name input
  classId: { type: mongoose.Schema.Types.ObjectId, ref: "ClassSchedule" },
  subject: { type: String, required: true },
  title: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileName: { type: String },
  fileSize: { type: Number },
  contentType: { type: String },
  status: { 
    type: String, 
    enum: ["submitted", "received", "graded", "returned"], 
    default: "submitted" 
  },
  grade: { type: String }, // or number
  feedback: { type: String },
  submittedAt: { type: Date, default: Date.now },
  receivedAt: { type: Date },
  gradedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model("Assignment", assignmentSchema);