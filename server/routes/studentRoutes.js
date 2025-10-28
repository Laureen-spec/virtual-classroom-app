import express from "express";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/dashboard", verifyToken, roleCheck(["student"]), (req, res) => {
  res.json({ message: "Welcome to the Student Dashboard!" });
});

export default router;
