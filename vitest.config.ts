import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Set env vars needed by app.ts before any module is loaded.
    // These override .env for test runs so tests are portable.
    env: {
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret',
      ADMIN_API_KEY: 'test-api-key',
      ADMIN_EMAIL: 'trainer@test.com',
      ADMIN_PASSWORD_HASH: '$2b$12$BNtIOw5ZLbsC7.Q7mZ9u9e0sDLnuTrcRTSdSlYLtpEVPsCIdklPaW', // bcrypt('test-password-123', 12)
      JWT_SECRET: 'test-jwt-secret',
      TRAINER_EMAIL: 'trainer@test.com',
      TRAINER_TIMEZONE: 'UTC',
    },
    include: ['server/__tests__/**/*.test.ts'],
  },
});
