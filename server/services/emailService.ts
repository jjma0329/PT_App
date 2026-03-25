import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API);

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

// Sent to the visitor after a successful booking.
export async function sendBookingConfirmation(booking: BookingDetails): Promise<void> {
  const formattedTime = formatSlotTime(booking.slotTime);

  await resend.emails.send({
    from: 'JJM Fitness <onboarding@resend.dev>',
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
    from: 'JJM Fitness <onboarding@resend.dev>',
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

export async function sendContactAlert(contact: ContactDetails): Promise<void> {
  await resend.emails.send({
    from: 'JJM Fitness <onboarding@resend.dev>',
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
