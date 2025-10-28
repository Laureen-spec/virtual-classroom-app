import express from "express";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/dashboard", verifyToken, roleCheck(["teacher"]), (req, res) => {
  res.json({ message: "Welcome to the Teacher Dashboard!" });
});

export default router;
