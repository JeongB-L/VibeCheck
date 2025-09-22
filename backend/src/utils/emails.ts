import dotenv from "dotenv";
import path from "path";
import nodemailer from "nodemailer";

dotenv.config({ path: path.join(__dirname, "../../.env") });

// Debug env loading
console.log("🔍 GMAIL_USER loaded:", !!process.env.GMAIL_USER);
console.log("🔍 GMAIL_PASS loaded:", !!process.env.GMAIL_PASS);

export interface EmailOptions {
  to: string;
  subject: string;
  name: string;
  verificationUrl: string;
  token: string;
}

export async function sendVerificationEmail(options: EmailOptions) {
  const { to, subject, name, verificationUrl, token } = options;

  // Your HTML email template (unchanged)
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">Welcome ${name}!</h2>
      <p>Thanks for signing up! Please verify your email address to get started.</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3>Your Verification Code:</h3>
        <div style="font-size: 24px; font-weight: bold; color: #007bff; text-align: center; letter-spacing: 5px; margin: 20px 0;">
          ${token.toUpperCase()}
        </div>
      </div>
      
      <p><strong>This code expires in 24 hours.</strong></p>
      <p>If you didn't create an account, please ignore this email.</p>
      
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>VibeCheck Team
      </p>
    </div>
  `;

  // Check if env vars exist
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    throw new Error(
      "❌ GMAIL_USER or GMAIL_PASS not found! Check your .env file."
    );
  }

  // Create Gmail transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"VibeCheck" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`✅ Email sent to ${to}`);
    return true;
  } catch (error) {
    console.error("❌ Email failed:", error);
    return false;
  }
}

async function testEmail() {
  console.log("Testing email send...");
  const temp = {
    to: "meetp1229@gmail.com", // Test with any email
    subject: "Test Verification Email",
    name: "Test User",
    verificationUrl: "http://localhost:4200/",
    token: "123456",
  };
  try {
    const res = await sendVerificationEmail(temp);
    if (res) {
      console.log("✅ Test email sent successfully!");
    } else {
      console.log("❌ Test email failed to send");
    }
  } catch (error) {
    console.error("💥 Test email failed:", error);
  }
}

testEmail();
