import { describe, expect, it } from "vitest";
import { sentryBrowserConfig, sentryConfigScript } from "./sentry";

describe("sentryBrowserConfig", () => {
  it("is off without a DSN", () => {
    expect(sentryBrowserConfig({})).toBeNull();
    expect(sentryBrowserConfig({ SENTRY_DSN: "  " })).toBeNull();
  });

  it("reads env with defaults", () => {
    expect(sentryBrowserConfig({ SENTRY_DSN: "https://k@o1.ingest.sentry.io/1" }, "sha-1")).toEqual({
      dsn: "https://k@o1.ingest.sentry.io/1",
      environment: "development",
      release: "sha-1",
      tracesSampleRate: 0,
    });
  });

  it("ignores an out-of-range sample rate", () => {
    expect(sentryBrowserConfig({ SENTRY_DSN: "x", SENTRY_TRACES_SAMPLE_RATE: "5" })?.tracesSampleRate).toBe(0);
    expect(sentryBrowserConfig({ SENTRY_DSN: "x", SENTRY_TRACES_SAMPLE_RATE: "0.2" })?.tracesSampleRate).toBe(0.2);
  });
});

describe("sentryConfigScript", () => {
  it("cannot close the script element", () => {
    const script = sentryConfigScript({ dsn: "</script><x>", environment: "p", tracesSampleRate: 0 });
    expect(script).not.toContain("</script>");
    expect(script.startsWith("window.__SENTRY_CONFIG__=")).toBe(true);
  });
});
