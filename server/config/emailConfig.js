import nodemailer from "nodemailer";

// Create a simple console-based transporter for development
// This will log the reset links to console instead of sending emails
const transporter = {
  sendMail: async (mailOptions) => {
    console.log("📧 Email would be sent to:", mailOptions.to);
    console.log("📧 Subject:", mailOptions.subject);
    console.log("🔗 Reset Link:", mailOptions.html.match(/http[^"]*/)?.[0] || "Link not found");
    console.log("---");
    
    // In production, you can replace this with actual email sending:
    /*
    const realTransporter = nodemailer.createTransporter({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    return await realTransporter.sendMail(mailOptions);
    */
    
    return { messageId: "console-log" };
  }
};

export default transporter;