import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import dotenv from "dotenv";
import User from "../models/User.js";
import transporter from "../config/emailConfig.js";
import { verifyToken, roleCheck } from "../middleware/authMiddleware.js";

dotenv.config();
const router = express.Router();

// 🔹 Register User (Public - Student only)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: "student", // Always set to student for public registration
    });

    await newUser.save();

    return res.status(201).json({
      message: "✅ Registration successful! Please log in.",
    });
  } catch (err) {
    console.error("Registration error:", err.message);
    return res.status(500).json({
      message: "Something went wrong during registration",
      error: err.message,
    });
  }
});

// 🔹 Login User
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(400).json({ message: "User not found. Please register first." });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      return res.status(400).json({ message: "Incorrect password" });

    // Generate JWT
    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    console.error("Login error:", err.message);
    return res.status(500).json({
      message: "Error during login",
      error: err.message,
    });
  }
});

// 🔹 Change Password (Authenticated Users)
router.post("/change-password", verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: "Current password and new password are required" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: "New password must be at least 6 characters long" 
      });
    }

    // Find user (from token verified by middleware)
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ 
        message: "New password must be different from current password" 
      });
    }

    // Hash and update new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await user.save();

    console.log(`✅ Password changed successfully for user: ${user.email}`);

    return res.status(200).json({ 
      message: "✅ Password changed successfully!" 
    });

  } catch (err) {
    console.error("Change password error:", err.message);
    return res.status(500).json({ 
      message: "Failed to change password", 
      error: err.message 
    });
  }
});

// 🔹 Admin: Create User (Teacher or Student)
router.post("/create-user", verifyToken, roleCheck(["admin"]), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Name, email, password and role are required" });
    }

    // Allow admin to create only teacher or student (not another admin)
    const allowedRoles = ["teacher", "student"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: `Role must be one of: ${allowedRoles.join(", ")}` });
    }

    const normalizedEmail = email.toLowerCase();
    
    // Check for existing user
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role,
    });

    await newUser.save();

    return res.status(201).json({ 
      message: "User created successfully", 
      user: { 
        id: newUser._id, 
        name: newUser.name, 
        email: newUser.email, 
        role: newUser.role 
      } 
    });
  } catch (err) {
    console.error("Create-user error:", err.message);
    return res.status(500).json({ 
      message: "Failed to create user", 
      error: err.message 
    });
  }
});

// 🔹 Forgot Password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // For security, don't reveal if email exists or not
      return res.status(200).json({
        message: "If your email is registered, you will receive a password reset link shortly.",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set token expiry (1 hour)
    user.resetPasswordToken = resetPasswordToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || "noreply@virtualclassroom.com",
      to: user.email,
      subject: "🔐 Password Reset Request - Virtual Classroom",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 28px;">Virtual Classroom</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Password Reset Request</p>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-bottom: 20px;">Hello ${user.name},</h2>
            <p style="color: #666; line-height: 1.6;">
              You requested to reset your password. Click the button below to create a new password:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 12px 30px; 
                        text-decoration: none; 
                        border-radius: 5px; 
                        font-weight: bold;
                        display: inline-block;">
                Reset Your Password
              </a>
            </div>
            <p style="color: #999; font-size: 12px; line-height: 1.6;">
              This link will expire in 1 hour. If you didn't request this reset, please ignore this email.
            </p>
            <p style="color: #999; font-size: 12px;">
              If the button doesn't work, copy and paste this link in your browser:<br>
              <a href="${resetUrl}" style="color: #667eea;">${resetUrl}</a>
            </p>
          </div>
          <div style="background: #333; padding: 20px; text-align: center; color: #999; font-size: 12px;">
            <p>Virtual Classroom App © 2024</p>
          </div>
        </div>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    console.log(`✅ Password reset email sent to: ${user.email}`);
    console.log(`⏰ Token expires at: ${new Date(user.resetPasswordExpires).toLocaleString()}`);

    // Use this for production - don't send reset URL in response
    return res.status(200).json({
      message: "If your email is registered, you will receive a password reset link shortly.",
    });

  } catch (err) {
    console.error("Forgot password error:", err.message);
    return res.status(500).json({
      message: "Error processing forgot password request",
      error: err.message,
    });
  }
});

// 🔹 Reset Password
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    // Hash the token to compare with stored token
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset token. Please request a new password reset.",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    console.log(`✅ Password reset successful for: ${user.email}`);

    return res.status(200).json({
      message: "✅ Password reset successful! You can now login with your new password.",
    });

  } catch (err) {
    console.error("Reset password error:", err.message);
    return res.status(500).json({
      message: "Error resetting password",
      error: err.message,
    });
  }
});

// 🔹 Verify Reset Token (optional - for frontend token validation)
router.get("/verify-reset-token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        valid: false,
        message: "Invalid or expired reset token",
      });
    }

    return res.status(200).json({
      valid: true,
      message: "Token is valid",
      email: user.email,
    });

  } catch (err) {
    console.error("Verify token error:", err.message);
    return res.status(500).json({
      valid: false,
      message: "Error verifying token",
    });
  }
});

export default router;