import cron from 'node-cron';
import app from './app.ts';
import { sendPendingReminders } from './services/reminderService.ts';
import { sendPendingReviewRequests } from './services/reviewRequestService.ts';

// Fail fast if any required env var is absent — better to crash at startup
// than to silently misbehave on first use (e.g. sending emails to undefined).
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'SESSION_SECRET',
  'JWT_SECRET',
  'RESEND_API',
  'TRAINER_EMAIL',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD_HASH',
  'OAUTH_CLIENT',
  'OAUTH_SECRET',
  'OAUTH_REDIRECT_URI',
];

const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`[fatal] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection:', reason);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Run at the top of every hour: 0 * * * *
// - Sends 24h reminder emails to upcoming confirmed bookings
// - Sends post-session review request emails to completed bookings
// Skipped in test environments to avoid side effects during the test suite.
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 * * * *', async () => {
    console.log('[cron] tick — processing reminders and review requests');
    await sendPendingReminders();
    await sendPendingReviewRequests();
  });
}
