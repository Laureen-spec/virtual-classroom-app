import express from "express";
import path from "path";
import fs from "fs";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";
import Material from "../models/Material.js";
import { upload } from "../utils/multerConfig.js";
import { uploadFileToS3 } from "../utils/s3.js"; // optional

const router = express.Router();

// Teacher uploads a material (notes)
router.post(
  "/upload",
  verifyToken,
  roleCheck(["teacher"]),
  upload.single("file"),
  async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });

      // by default local path
      let fileUrl = `/uploads/${file.filename}`; // use for local dev
      // if you want to push to S3:
      // const s3Url = await uploadFileToS3(file.path, `materials/${file.filename}`);
      // fileUrl = s3Url;

      const material = new Material({
        title: req.body.title || file.originalname,
        description: req.body.description,
        teacher: req.user.id,
        classId: req.body.classId || null,
        subject: req.body.subject || null,
        fileUrl,
        fileName: file.originalname,
        fileSize: file.size,
        contentType: file.mimetype
      });

      await material.save();
      res.status(201).json({ message: "Material uploaded", material });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Upload failed", error: err.message });
    }
  }
);

// Get materials (teacher or student)
router.get("/", verifyToken, async (req, res) => {
  try {
    const { subject, classId } = req.query;
    const filter = {};
    if (subject) filter.subject = subject;
    if (classId) filter.classId = classId;
    const materials = await Material.find(filter).populate("teacher", "name email");
    res.json(materials);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch materials" });
  }
});

// Serve local files (dev): GET /api/materials/file/:filename
router.get("/file/:filename", (req, res) => {
  const filepath = path.join(process.cwd(), "uploads", req.params.filename);
  if (fs.existsSync(filepath)) return res.sendFile(filepath);
  res.status(404).json({ message: "File not found" });
});

export default router;
