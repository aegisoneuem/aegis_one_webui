import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const API_ORIGIN = process.env['VITE_API_ORIGIN'] ?? 'http://localhost:8080';

/**
 * Serves the console with the security headers production must send.
 *
 * Lighthouse reported "No CSP found in enforcement mode", and it was right:
 * the mock server sets a CSP on *API* responses, but the API does not serve
 * the app. Whatever hosts these static files has to send its own, and if the
 * dev server does not, the first time anyone meets a CSP violation is in
 * production.
 *
 * The policy below is the one the console needs. Keep it in step with
 * whatever serves `dist/` — a CDN, nginx, or the Go service.
 */
function securityHeaders(): Plugin {
  const policy = (dev: boolean) =>
    [
      "default-src 'none'",
      /*
       * Production gets `script-src 'self'` with nothing else — no
       * unsafe-inline, which is the only reason to have a CSP at all.
       *
       * The dev server cannot: Vite bootstraps React Refresh from an inline
       * <script> in index.html, and the strict policy blocks it, leaving a
       * blank page. The concession is dev-only and never ships; `vite preview`
       * serves the real policy, which is where it should be verified.
       */
      dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
      // Vite injects style tags during HMR for the same reason.
      dev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
      "font-src 'self'",
      "img-src 'self' data:",
      // The dev server's HMR socket is a websocket to its own origin.
      dev ? `connect-src 'self' ws: ${API_ORIGIN}` : `connect-src 'self' ${API_ORIGIN}`,
      "form-action 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ].join('; ');

  const apply = (dev: boolean) => (server: { middlewares: { use: (fn: Middleware) => void } }) => {
    const csp = policy(dev);
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Content-Security-Policy', csp);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader(
        'Permissions-Policy',
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      );
      next();
    });
  };

  return {
    name: 'aegis-security-headers',
    configureServer: apply(true),
    // Vite's dev server and its preview server are separate; the headers have
    // to be attached to both, or `vite preview` measures something the real
    // deployment will not be.
    configurePreviewServer: apply(false),
  };
}

type Middleware = (
  req: unknown,
  res: { setHeader: (name: string, value: string) => void },
  next: () => void,
) => void;

export default defineConfig({
  plugins: [react(), securityHeaders()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { sourcemap: false },
});
