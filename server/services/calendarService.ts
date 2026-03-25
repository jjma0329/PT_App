import { google } from 'googleapis';
import { prisma } from '../lib/prisma.ts';

// --- OAuth2 client setup ---
// This client is the "identity" of our app when talking to Google.
// It uses the credentials from .env to identify itself.
export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.OAUTH_CLIENT,
    process.env.OAUTH_SECRET,
    process.env.OAUTH_REDIRECT_URI, // must match what's registered in Google Cloud Console
  );
}

// Generates the Google consent screen URL.
// 'offline' access_type is required to receive a refresh token.
// 'consent' prompt forces Google to re-issue a refresh token on every auth
// (important for dev — without it Google only sends the refresh token once).
export function getAuthUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    // calendar.events covers both reading free/busy AND creating events.
    // Replacing calendar.readonly — trainer must re-run /auth/google once to
    // get a new token with this broader scope.
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state, // Google echoes this back in the callback so we can verify it
  });
}

// Exchanges the one-time authorization code (from the callback URL) for tokens,
// then persists them to the database. Uses upsert so re-auth overwrites the old record.
export async function saveTokensFromCode(code: string): Promise<void> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Google did not return the expected tokens.');
  }

  const expiresAt = new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000);

  // upsert: update if a row exists for 'google', insert if not
  await prisma.oAuthToken.upsert({
    where: { id: 1 },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
    create: {
      provider: 'google',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
  });
}

// Loads the stored token from DB and returns an authenticated OAuth2 client.
// If the access token is expired (or about to expire within 5 min), it refreshes
// automatically and saves the new access token back to the DB.
export async function getAuthenticatedClient() {
  const stored = await prisma.oAuthToken.findFirst({
    where: { provider: 'google' },
  });

  if (!stored) {
    throw new Error('No OAuth token found. Trainer must complete Google authorization first.');
  }

  const client = createOAuthClient();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  });

  // Check if token expires within the next 5 minutes
  const fiveMinutes = 5 * 60 * 1000;
  const isExpiringSoon = stored.expiresAt.getTime() - Date.now() < fiveMinutes;

  if (isExpiringSoon) {
    // Ask Google for a new access token using the stored refresh token
    const { credentials } = await client.refreshAccessToken();

    const newExpiresAt = new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000);

    // Persist the new access token so the next request doesn't need to refresh again
    await prisma.oAuthToken.update({
      where: { id: stored.id },
      data: {
        accessToken: credentials.access_token ?? stored.accessToken,
        expiresAt: newExpiresAt,
      },
    });

    client.setCredentials(credentials);
  }

  return client;
}

// Trainer's working hours by day type.
// Each entry is [startHour, endHour] in 24h format (trainer's local timezone).
const WORKING_HOURS: Record<'weekday' | 'weekend', [number, number]> = {
  weekday: [18, 22], // 6 PM – 10 PM → slots at 18, 19, 20, 21
  weekend: [16, 20], // 4 PM – 8 PM  → slots at 16, 17, 18, 19
};

// Returns an array of available ISO datetime strings for a given date.
// Steps:
//   1. Build all 1-hour candidate slots within working hours
//   2. Query Google Calendar freebusy to find blocked ranges
//   3. Remove any candidate that overlaps a blocked range
//   4. Remove any candidate that starts within 48 hours from now
export async function getAvailableSlots(dateStr: string): Promise<string[]> {
  const timezone = process.env.TRAINER_TIMEZONE ?? 'UTC';

  // Parse the requested date in the trainer's timezone
  const requestedDate = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = requestedDate.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const [startHour, endHour] = WORKING_HOURS[isWeekend ? 'weekend' : 'weekday'];

  // Build candidate slot start times (one per hour within working hours)
  const candidates: Date[] = [];
  for (let hour = startHour; hour < endHour; hour++) {
    // Construct the slot as a local time string, then let Date parse it
    const slot = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`);
    candidates.push(slot);
  }

  // The freebusy query needs a window covering the full working day
  const windowStart = candidates[0].toISOString();
  const windowEnd = new Date(`${dateStr}T${String(endHour).padStart(2, '0')}:00:00`).toISOString();

  const authClient = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  // freebusy returns the busy time blocks (not the free ones — we invert them)
  const freebusyResponse = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart,
      timeMax: windowEnd,
      timeZone: timezone,
      items: [{ id: 'primary' }], // 'primary' = trainer's main calendar
    },
  });

  const busyBlocks = freebusyResponse.data.calendars?.['primary']?.busy ?? [];

  const fortyEightHoursFromNow = Date.now() + 48 * 60 * 60 * 1000;

  // Filter candidates: keep only slots that are free and far enough in the future
  const available = candidates.filter((slot) => {
    const slotStart = slot.getTime();
    const slotEnd = slotStart + 60 * 60 * 1000; // 1-hour session

    // Drop slots within 48 hours of now
    if (slotStart < fortyEightHoursFromNow) return false;

    // Drop slot if it overlaps any busy block
    const overlaps = busyBlocks.some((block) => {
      const busyStart = new Date(block.start!).getTime();
      const busyEnd = new Date(block.end!).getTime();
      // Overlap condition: slot starts before busy ends AND slot ends after busy starts
      return slotStart < busyEnd && slotEnd > busyStart;
    });

    return !overlaps;
  });

  return available.map((slot) => slot.toISOString());
}

interface BookingForCalendar {
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  slotTime: Date;
}

// Creates a 1-hour event on the trainer's primary Google Calendar for a confirmed booking.
// Called after the booking is saved to the DB — a failure here is non-fatal (the booking
// still exists; the trainer just won't see it in the calendar automatically).
export async function createCalendarEvent(booking: BookingForCalendar): Promise<void> {
  const authClient = await getAuthenticatedClient();
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const sessionEnd = new Date(booking.slotTime.getTime() + 60 * 60 * 1000); // 1-hour session

  // Build the description from whatever booking fields are present
  const descriptionLines = [
    `Client: ${booking.name}`,
    `Email: ${booking.email}`,
    booking.phone ? `Phone: ${booking.phone}` : null,
    booking.message ? `Notes: ${booking.message}` : null,
  ].filter((line): line is string => line !== null);

  await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: `PT Session — ${booking.name}`,
      description: descriptionLines.join('\n'),
      start: { dateTime: booking.slotTime.toISOString() },
      end: { dateTime: sessionEnd.toISOString() },
      // Adds the client as an attendee so Google sends them a calendar invite
      attendees: [{ email: booking.email, displayName: booking.name }],
    },
  });
}
