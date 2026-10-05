import * as Sentry from "@sentry/react-router";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { readSentryBrowserConfig, SENTRY_DATA_COLLECTION } from "~/lib/sentry";

const sentry = readSentryBrowserConfig();
if (sentry) {
  Sentry.init({
    ...sentry,
    dataCollection: SENTRY_DATA_COLLECTION,
    integrations: sentry.tracesSampleRate > 0 ? [Sentry.reactRouterTracingIntegration()] : [],
  });
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter onError={sentry ? Sentry.sentryOnError : undefined} />
    </StrictMode>,
  );
});
