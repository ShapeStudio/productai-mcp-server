import * as Sentry from "@sentry/node";
import pino from "pino";

const sentryDsn = process.env.SENTRY_DSN;
const env = process.env.NODE_ENV ?? "production";
const release = process.env.GIT_COMMIT ?? process.env.SOURCE_VERSION;

// --- Logger (structured JSON to stdout; DO Runtime Logs are full-text searchable) ---

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { svc: "productai-mcp", env },
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.access_token",
      "*.refresh_token",
      "*.client_secret",
      "*.api_key",
      "*.key",
    ],
    censor: "[redacted]",
  },
});

// --- Sentry init (no-op if SENTRY_DSN unset) ---

export const sentryEnabled = Boolean(sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    environment: env,
    release,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  });
  log.info({ release }, "Sentry initialised");
}

/**
 * Annotate the current scope with who the user is. Call this from /mcp
 * once we've verified the bearer so subsequent errors carry user context.
 */
export function setUserContext(claims: { sub: string; auth0_sub?: string; email?: string; client_id?: string }) {
  if (!sentryEnabled) return;
  Sentry.setUser({
    id: claims.sub,
    email: claims.email,
  });
  Sentry.setTag("auth0_sub", claims.auth0_sub ?? "unknown");
  Sentry.setTag("mcp_client_id", claims.client_id ?? "unknown");
}

export function captureError(err: unknown, ctx: Record<string, unknown> = {}): void {
  log.error({ err, ...ctx }, "captured error");
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: ctx });
  }
}

export { Sentry };
