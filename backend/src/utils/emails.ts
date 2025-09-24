import dotenv from "dotenv";
import path from "path";
import nodemailer from "nodemailer";

dotenv.config({ path: path.join(__dirname, "../../.env") });

export interface EmailOptions {
  to: string;
  subject: string;
  name: string;
  verificationUrl: string;
  token: string;
  template_choice?: "reset_password";
}

export async function sendVerificationEmail(options: EmailOptions) {
  const { to, subject, name, verificationUrl, token, template_choice } =
    options;

  let html = `
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

  if (template_choice === "reset_password") {
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Hi ${name}!</h2>
        <p>We just made a fresh new password for you! Feel free to change it after logging in.</p>

        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Your new password:</h3>
          <h2 style="font-family: monospace">${token}</h2>

        </div>

        <p>If you didn’t request a password reset, please secure your account.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">
          Best regards,<br>VibeCheck Team
        </p>
      </div>
    `;
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    throw new Error(
      "GMAIL_USER or GMAIL_PASS not found! Check your .env file."
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"VibeCheck" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });

  return true;
}
