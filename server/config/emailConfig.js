import sgMail from '@sendgrid/mail';

console.log("🔧 Email Config - Checking SendGrid credentials...");
console.log("SENDGRID_API_KEY exists:", !!process.env.SENDGRID_API_KEY);
console.log("EMAIL_FROM:", process.env.EMAIL_FROM);

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
    // Prepare SendGrid email with better error handling
    const msg = {
      to: mailOptions.to,
      from: process.env.EMAIL_FROM || 'noreply@virtualclassroom.com',
      subject: mailOptions.subject,
      html: mailOptions.html,
      mailSettings: {
        sandboxMode: {
          enable: false // Make sure this is false for production
        }
      }
    };

    console.log(`📤 Attempting to send email to: ${mailOptions.to}`);
    
    // Send email via SendGrid
    const result = await sgMail.send(msg);
    console.log(`✅ Email sent successfully to: ${mailOptions.to}`);
    console.log(`📧 SendGrid Message ID: ${result[0]?.headers?.['x-message-id'] || result[0]?.messageId || 'unknown'}`);
    console.log(`📧 SendGrid Status: ${result[0]?.statusCode || 'unknown'}`);
    return result[0];
  } catch (error) {
    console.error('❌ SendGrid error details:');
    console.error('Error message:', error.message);
    
    if (error.response) {
      console.error('Status code:', error.response.statusCode);
      console.error('Response body:', error.response.body);
      console.error('Response headers:', error.response.headers);
    }
    
    // Fallback to console logging
    console.log("📧 Email would be sent to (fallback):", mailOptions.to);
    console.log("📧 Subject:", mailOptions.subject);
    console.log("🔗 Reset Link:", mailOptions.html.match(/http[^"]*/)?.[0] || "Link not found");
    return { messageId: "console-fallback" };
  }
};

export default { sendMail: sendEmail };