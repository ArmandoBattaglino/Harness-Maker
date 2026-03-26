// server/middleware/security.js
// Applies Helmet with a strict Content Security Policy.

import helmet from 'helmet';

export function securityMiddleware(app) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // Tailwind + Google Fonts CSS
          connectSrc: ["'self'", 'ws://127.0.0.1:*'],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
        },
      },
    })
  );
}
