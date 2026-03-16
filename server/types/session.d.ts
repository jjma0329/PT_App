import 'express-session';

// Extends the default session type so TypeScript knows about our custom field.
// Without this, req.session.oauthState would be a TS error.
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
  }
}
