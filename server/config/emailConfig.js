import sgMail from '@sendgrid/mail';

console.log("🔧 Email Config - Checking SendGrid credentials...");
console.log("SENDGRID_API_KEY exists:", !!process.env.SENDGRID_API_KEY);

// Configure SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log("✅ SendGrid configured successfully");
} else {
  console.log("⚠️ SENDGRID_API_KEY not found. Using console transport.");
}

const sendEmail = async (mailOptions) => {
  // If no SendGrid API key, fallback to console logging
  if (!process.env.SENDGRID_API_KEY) {
    console.log("📧 Email would be sent to:", mailOptions.to);
    console.log("📧 Subject:", mailOptions.subject);
    console.log("🔗 Reset Link:", mailOptions.html.match(/http[^"]*/)?.[0] || "Link not found");
    console.log("---");
    return { messageId: "console-log" };
  }

  try {
    // Prepare SendGrid email
    const msg = {
      to: mailOptions.to,
      from: process.env.EMAIL_FROM || 'noreply@virtualclassroom.com',
      subject: mailOptions.subject,
      html: mailOptions.html,
    };

    // Send email via SendGrid
    const result = await sgMail.send(msg);
    console.log(`✅ Email sent successfully to: ${mailOptions.to}`);
    console.log(`📧 Message ID: ${result[0]?.headers?.['x-message-id'] || 'unknown'}`);
    return result[0];
  } catch (error) {
    console.error('❌ SendGrid error:', error);
    
    // If SendGrid fails, fallback to console
    if (error.response) {
      console.error('SendGrid response error:', error.response.body);
    }
    
    console.log("📧 Email would be sent to (fallback):", mailOptions.to);
    console.log("📧 Subject:", mailOptions.subject);
    console.log("🔗 Reset Link:", mailOptions.html.match(/http[^"]*/)?.[0] || "Link not found");
    return { messageId: "console-fallback" };
  }
};

export default { sendMail: sendEmail };