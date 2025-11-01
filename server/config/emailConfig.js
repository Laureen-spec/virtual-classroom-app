import nodemailer from "nodemailer";

console.log("🔧 Email Config - Checking credentials...");
console.log("EMAIL_USER exists:", !!process.env.EMAIL_USER);
console.log("EMAIL_PASS exists:", !!process.env.EMAIL_PASS);

// Create transporter based on environment
const createTransporter = () => {
  // Check if we have valid email credentials
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS && 
      process.env.EMAIL_USER !== 'yourgmail@gmail.com' && 
      process.env.EMAIL_PASS !== 'your_app_password') {
    
    console.log("✅ Using Gmail transporter with:", process.env.EMAIL_USER);
    
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  } else {
    // Fallback to console logging
    console.log("⚠️ Email credentials not found or using defaults. Using console transport.");
    console.log("Current EMAIL_USER:", process.env.EMAIL_USER);
    console.log("Current EMAIL_PASS:", process.env.EMAIL_PASS ? "***" + process.env.EMAIL_PASS.slice(-4) : "undefined");
    
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