import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock (both are hoisted, but hoisted runs first),
// letting us capture the spy reference in a variable accessible inside the factory.
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ id: 'mock-email-id' }),
}));

// Mock the Resend SDK so no real HTTP calls are made.
// Uses a regular `function` (not an arrow function) so it can be called with `new`.
vi.mock('resend', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Resend: function MockResend(this: any) {
    this.emails = { send: mockSend };
  },
}));

import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendBookingReminder,
  sendCancellationNotification,
  sendClientCancellationEmail,
  sendReviewRequest,
  sendContactAlert,
} from '../services/emailService.ts';

const slot = new Date('2027-06-01T14:00:00.000Z');

const clientBooking = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '555-0100',
  message: 'See you there',
  slotTime: slot,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────
// sendBookingConfirmation
// ─────────────────────────────────────────────
describe('sendBookingConfirmation', () => {
  it('calls resend.emails.send once with the client email as "to"', async () => {
    await sendBookingConfirmation(clientBooking);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0].to).toBe('jane@example.com');
  });

  it('does not include raw HTML special chars from the booking name in the output', async () => {
    await sendBookingConfirmation({ ...clientBooking, name: '<script>alert(1)</script>' });

    const { html } = mockSend.mock.calls[0][0] as { html: string };
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not include unescaped quotes or ampersands from user input', async () => {
    await sendBookingConfirmation({ ...clientBooking, name: 'O\'Brien & "Sons"' });

    const { html } = mockSend.mock.calls[0][0] as { html: string };
    expect(html).not.toContain("O'Brien");
    expect(html).toContain('&#039;Brien');
    expect(html).toContain('&amp;');
    expect(html).toContain('&quot;Sons&quot;');
  });
});

// ─────────────────────────────────────────────
// sendBookingNotification (trainer alert)
// ─────────────────────────────────────────────
describe('sendBookingNotification', () => {
  it('sends to TRAINER_EMAIL (set to trainer@test.com in vitest.config.ts)', async () => {
    await sendBookingNotification(clientBooking);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0].to).toBe('trainer@test.com');
  });

  it('does not expose raw HTML in the trainer notification', async () => {
    await sendBookingNotification({ ...clientBooking, name: '<img src=x onerror=alert(1)>' });

    const { html } = mockSend.mock.calls[0][0] as { html: string };
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('renders null phone as the em-dash placeholder', async () => {
    await sendBookingNotification({ ...clientBooking, phone: null });

    const { html } = mockSend.mock.calls[0][0] as { html: string };
    expect(html).toContain('—');
  });
});

// ─────────────────────────────────────────────
// sendBookingReminder (24-hour reminder)
// ─────────────────────────────────────────────
describe('sendBookingReminder', () => {
  it('sends to the client email', async () => {
    await sendBookingReminder(clientBooking);

    expect(mockSend).toHaveBeenCalledOnce();
    expect(mockSend.mock.calls[0][0].to).toBe('jane@example.com');
  });

  it('subject contains "Reminder"', async () => {
    await sendBookingReminder(clientBooking);

    const { subject } = mockSend.mock.calls[0][0] as { subject: string };
    expect(subject.toLowerCase()).toContain('reminder');
  });
});

// ─────────────────────────────────────────────
// sendCancellationNotification
// ─────────────────────────────────────────────
describe('sendCancellationNotification', () => {
  it('sends to TRAINER_EMAIL', async () => {
    await sendCancellationNotification(clientBooking);

    expect(mockSend.mock.calls[0][0].to).toBe('trainer@test.com');
  });

  it('subject mentions "cancelled"', async () => {
    await sendCancellationNotification(clientBooking);

    const { subject } = mockSend.mock.calls[0][0] as { subject: string };
    expect(subject.toLowerCase()).toContain('cancel');
  });
});

// ─────────────────────────────────────────────
// sendReviewRequest
// ─────────────────────────────────────────────
describe('sendReviewRequest', () => {
  it('sends to the client email', async () => {
    await sendReviewRequest(clientBooking);

    expect(mockSend.mock.calls[0][0].to).toBe('jane@example.com');
  });

  it('html contains a link to the /review page', async () => {
    await sendReviewRequest(clientBooking);

    const { html } = mockSend.mock.calls[0][0] as { html: string };
    expect(html).toContain('/review');
  });
});

// ─────────────────────────────────────────────
// sendContactAlert
// ─────────────────────────────────────────────
describe('sendContactAlert', () => {
  it('sends to TRAINER_EMAIL', async () => {
    await sendContactAlert({ name: 'Alex', email: 'alex@example.com' });

    expect(mockSend.mock.calls[0][0].to).toBe('trainer@test.com');
  });

  it('does not expose unescaped HTML from contact name', async () => {
    await sendContactAlert({ name: '<b>Hacked</b>', email: 'x@example.com' });

    const { html } = mockSend.mock.calls[0][0] as { html: string };
    expect(html).not.toContain('<b>Hacked</b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('renders null optional fields as the em-dash placeholder', async () => {
    await sendContactAlert({ name: 'Alex', email: 'alex@example.com', phone: null, goal: null });

    const { html } = mockSend.mock.calls[0][0] as { html: string };
    // Two null fields → two em-dashes in the table
    const dashCount = (html.match(/—/g) ?? []).length;
    expect(dashCount).toBeGreaterThanOrEqual(2);
  });
});
