import axios from 'axios';
import logger from 'jet-logger';

interface IMail {
  to: string;
  subject: string;
  html: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ||
  'Garden Fairy <orders@gardenfairy.ng>';

/**
 * Transactional email. Sends via Resend when RESEND_API_KEY is configured;
 * otherwise logs the message (development default). Send failures are
 * logged but never thrown — email must not break checkout flows.
 */
export const sendMail = async (mail: IMail): Promise<void> => {
  if (!RESEND_API_KEY) {
    logger.info(`[mailer:dev] To: ${mail.to} | Subject: ${mail.subject}`);
    return;
  }
  try {
    await axios.post(
      'https://api.resend.com/emails',
      { from: EMAIL_FROM, to: mail.to, subject: mail.subject, html: mail.html },
      { headers: { Authorization: `Bearer ${RESEND_API_KEY}` } },
    );
  } catch (err) {
    logger.err(`[mailer] Failed to send "${mail.subject}" to ${mail.to}`);
    logger.err(err as Error);
  }
};

export const sendOrderConfirmation = async (
  to: string,
  orderId: string,
  total: number,
) =>
  sendMail({
    to,
    subject: `Order confirmed — #${orderId}`,
    html: `
      <h2>Thanks for your order!</h2>
      <p>Your payment for order <strong>#${orderId}</strong>
      (₦${total.toLocaleString()}) was received.</p>
      <p>We'll let you know as soon as your plants are on their way.</p>`,
  });

export const sendPasswordReset = async (
  to: string,
  resetUrl: string,
) =>
  sendMail({
    to,
    subject: 'Reset your Garden Fairy password',
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${resetUrl}">Click here to set a new password</a>.
      This link expires in 30 minutes.</p>
      <p>If you didn't request this, you can ignore this email.</p>`,
  });
