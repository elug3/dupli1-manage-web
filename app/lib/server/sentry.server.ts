import { sentryBrowserConfig } from "~/lib/sentry";

/** Browser Sentry config from this process's env; null when SENTRY_DSN is unset. */
export function loadSentryBrowserConfig() {
  const sha = process.env.APP_GIT_SHA?.trim();
  return sentryBrowserConfig(process.env, sha && sha !== "local" ? sha : undefined);
}
