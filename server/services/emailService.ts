import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API);

// Override in production once you have a verified Resend domain.
// Dev default uses Resend's shared sandbox address.
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? 'JJM Fitness <onboarding@resend.dev>';

interface ContactDetails {
  name: string;
  email: string;
  phone?: string | null;
  goal?: string | null;
  message?: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeField(value: string | null | undefined): string {
  return value ? escapeHtml(value) : '—';
}

interface BookingDetails {
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  slotTime: Date;
}

// Formats a Date for display in emails using the trainer's configured timezone.
function formatSlotTime(date: Date): string {
  const timezone = process.env.TRAINER_TIMEZONE ?? 'UTC';
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Sent to the client immediately after they submit a booking request (before trainer confirms).
export async function sendBookingRequestReceived(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: booking.email,
    subject: `Booking request received — ${formattedTime}`,
    html: `
      <h2>Request received!</h2>
      <p>Hi ${escapeHtml(booking.name)},</p>
      <p>We've received your request for a personal training session on:</p>
      <p><strong>${escapeHtml(formattedTime)}</strong></p>
      <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px;">
        <tr><td><strong>Name</strong></td><td>${escapeHtml(booking.name)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(booking.email)}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${safeField(booking.phone)}</td></tr>
      </table>
      <p>We'll review your request and send a confirmation shortly.</p>
      <p style="color:#71717a;font-size:13px;">If you did not make this request, please ignore this email.</p>
    `,
  });
}

// Sent to the visitor after the trainer confirms their booking.
export async function sendBookingConfirmation(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: booking.email,
    subject: `Your session is confirmed — ${formattedTime}`,
    html: `
      <h2>You're booked!</h2>
      <p>Hi ${escapeHtml(booking.name)},</p>
      <p>Your personal training session has been confirmed for:</p>
      <p><strong>${escapeHtml(formattedTime)}</strong></p>
      <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px;">
        <tr><td><strong>Name</strong></td><td>${escapeHtml(booking.name)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(booking.email)}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${safeField(booking.phone)}</td></tr>
      </table>
      <p>If you need to cancel or reschedule, please contact the trainer directly.</p>
    `,
  });
}

// Sent to the trainer when a new booking is made.
export async function sendBookingNotification(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: process.env.TRAINER_EMAIL!,
    subject: `New booking — ${escapeHtml(booking.name)} at ${escapeHtml(formattedTime)}`,
    html: `
      <h2>New Session Booked</h2>
      <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px;">
        <tr><td><strong>Client</strong></td><td>${escapeHtml(booking.name)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(booking.email)}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${safeField(booking.phone)}</td></tr>
        <tr><td><strong>Time</strong></td><td>${escapeHtml(formattedTime)}</td></tr>
        <tr><td><strong>Notes</strong></td><td>${safeField(booking.message)}</td></tr>
      </table>
    `,
  });
}

// Sent to the client 24 hours before their session as a reminder.
export async function sendBookingReminder(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: booking.email,
    subject: `Reminder: your session is tomorrow — ${formattedTime}`,
    html: `
      <h2>See you tomorrow!</h2>
      <p>Hi ${escapeHtml(booking.name)},</p>
      <p>This is a reminder that your personal training session is scheduled for:</p>
      <p><strong>${escapeHtml(formattedTime)}</strong></p>
      <p>If you need to cancel or reschedule, please contact the trainer as soon as possible.</p>
    `,
  });
}

// Sent to the trainer when they cancel a booking.
export async function sendCancellationNotification(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: process.env.TRAINER_EMAIL!,
    subject: `Booking cancelled — ${escapeHtml(booking.name)} at ${escapeHtml(formattedTime)}`,
    html: `
      <h2>Booking Cancelled</h2>
      <p>The following session has been cancelled:</p>
      <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px;">
        <tr><td><strong>Client</strong></td><td>${escapeHtml(booking.name)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(booking.email)}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${safeField(booking.phone)}</td></tr>
        <tr><td><strong>Time</strong></td><td>${escapeHtml(formattedTime)}</td></tr>
        <tr><td><strong>Notes</strong></td><td>${safeField(booking.message)}</td></tr>
      </table>
    `,
  });
}

// Sent to the client ~1 hour after their session ends, asking them to leave a review.
// The link points to the public /review page on the site.
export async function sendReviewRequest(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);
  const siteUrl = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173';

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: booking.email,
    subject: 'How was your session? Leave a quick review',
    html: `
      <h2>Hope your session went well!</h2>
      <p>Hi ${escapeHtml(booking.name)},</p>
      <p>You recently trained with JJM Fitness on <strong>${escapeHtml(formattedTime)}</strong>.</p>
      <p>It would mean a lot if you took 30 seconds to leave a review:</p>
      <p>
        <a href="${siteUrl}/review" style="display:inline-block;background:#facc15;color:#18181b;font-weight:bold;padding:10px 20px;border-radius:8px;text-decoration:none;">
          Leave a review
        </a>
      </p>
      <p style="color:#71717a;font-size:13px;">Thank you for training with us!</p>
    `,
  });
}

// Sent to the client when the trainer cancels their booking.
export async function sendClientCancellationEmail(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: booking.email,
    subject: `Your session on ${formattedTime} has been cancelled`,
    html: `
      <h2>Session Cancelled</h2>
      <p>Hi ${escapeHtml(booking.name)},</p>
      <p>Your personal training session scheduled for <strong>${escapeHtml(formattedTime)}</strong> has been cancelled.</p>
      <p>Please contact the trainer directly if you'd like to reschedule.</p>
    `,
  });
}

export async function sendContactAlert(contact: ContactDetails): Promise<void> {
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: process.env.TRAINER_EMAIL!,
    subject: `New session booking — ${escapeHtml(contact.name)}`,
    html: `
      <h2>New Contact Form Submission</h2>
      <table cellpadding="8" style="border-collapse:collapse;font-family:sans-serif;font-size:15px;">
        <tr><td><strong>Name</strong></td><td>${escapeHtml(contact.name)}</td></tr>
        <tr><td><strong>Email</strong></td><td>${escapeHtml(contact.email)}</td></tr>
        <tr><td><strong>Phone</strong></td><td>${safeField(contact.phone)}</td></tr>
        <tr><td><strong>Goal</strong></td><td>${safeField(contact.goal)}</td></tr>
        <tr><td><strong>Message</strong></td><td>${safeField(contact.message)}</td></tr>
      </table>
    `,
  });
}
