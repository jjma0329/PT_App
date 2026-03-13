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
