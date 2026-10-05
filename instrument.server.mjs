// Loaded before the server build (`node --import`, see the start script) so
// Sentry can instrument Node before anything else is imported. With
// SENTRY_DSN unset this does nothing. Request bodies, cookies (the session
// cookie) and stack-frame locals are never sent; headers and query params go
// through Sentry's sensitive-key filter (same as SENTRY_DATA_COLLECTION in
// app/lib/sentry.ts).
//
//   SENTRY_DSN, SENTRY_ENVIRONMENT, SENTRY_RELEASE (default APP_GIT_SHA),
//   SENTRY_TRACES_SAMPLE_RATE,
//   SENTRY_LOGS=false to stop forwarding console.warn/error as Sentry Logs.
import * as Sentry from "@sentry/react-router";

// The image's build arg; "local" means a build outside CI.
function appRelease() {
  const sha = process.env.APP_GIT_SHA?.trim();
  return sha && sha !== "local" ? sha : undefined;
}

const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  const rate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0");
  const logs = process.env.SENTRY_LOGS?.trim().toLowerCase() !== "false";
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || "development",
    release: process.env.SENTRY_RELEASE?.trim() || appRelease(),
    tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0,
    dataCollection: { userInfo: false, cookies: false, httpBodies: [], stackFrameVariables: false },
    enableLogs: logs,
    integrations: logs ? [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })] : [],
  });
}
