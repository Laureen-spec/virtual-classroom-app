import nodemailer from "nodemailer";

// Create transporter based on environment
const createTransporter = () => {
  // If we have email credentials, use real email service
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransporter({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Fallback to console logging for development
    console.log("⚠️ Email credentials not found. Using console transport.");
    return {
      sendMail: async (mailOptions) => {
        console.log("📧 Email would be sent to:", mailOptions.to);
        console.log("📧 Subject:", mailOptions.subject);
        console.log("🔗 Reset Link:", mailOptions.html.match(/http[^"]*/)?.[0] || "Link not found");
        console.log("---");
        return { messageId: "console-log" };
      }
    };
  }
};

const transporter = createTransporter();

export default transporter;