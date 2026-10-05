// Sentry error and log reporting. The browser SDK is configured at runtime
// from the server's environment (root loader → inline script → entry.client),
// so one image serves any Sentry project; with SENTRY_DSN unset nothing loads
// a config and Sentry stays off. Server side: instrument.server.mjs.

import type { init } from "@sentry/react-router";

type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>["dataCollection"]>;

export type SentryBrowserConfig = {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
};

/**
 * What the SDK may attach to events. Shoppers' and operators' request bodies,
 * cookies (the session cookie) and stack-frame locals (tokens) never leave;
 * headers and query params go through Sentry's sensitive-key filter.
 * instrument.server.mjs repeats this for the server.
 */
export const SENTRY_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpBodies: [],
  stackFrameVariables: false,
};

/** Window global the inline config script sets and entry.client reads. */
export const SENTRY_CONFIG_GLOBAL = "__SENTRY_CONFIG__";

/** Reads the browser config from env; null when SENTRY_DSN is unset. */
export function sentryBrowserConfig(
  env: Record<string, string | undefined>,
  defaultRelease?: string,
): SentryBrowserConfig | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE ?? "0");
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || "development",
    release: env.SENTRY_RELEASE?.trim() || defaultRelease || undefined,
    tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0,
  };
}

/** Inline script body that publishes config to entry.client. */
export function sentryConfigScript(config: SentryBrowserConfig): string {
  // `<` is escaped so a value can never close the <script> element.
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return `window.${SENTRY_CONFIG_GLOBAL}=${json};`;
}

export function readSentryBrowserConfig(): SentryBrowserConfig | null {
  if (typeof window === "undefined") return null;
  const config = (window as unknown as Record<string, unknown>)[SENTRY_CONFIG_GLOBAL];
  return config && typeof config === "object" ? (config as SentryBrowserConfig) : null;
}
