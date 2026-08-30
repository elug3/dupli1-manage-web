import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

import "./app.css";
import {
  DEFAULT_LOCALE,
  getLocaleFromRequest,
  I18nProvider,
  translate,
  type Locale,
} from "~/lib/i18n";
import { NotificationProvider } from "~/lib/notifications";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "~/lib/theme";

export const links = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous" as const,
  },
  {
    rel: "stylesheet",
    // Cascadia Code covers Latin/English; Noto Sans KR covers Hangul (and CJK fallback).
    href: "https://fonts.googleapis.com/css2?family=Cascadia+Code:ital,wght@0,200..700;1,200..700&family=Noto+Sans+KR:wght@100..900&display=swap",
  },
];

export async function loader({ request }: { request: Request }) {
  return { locale: getLocaleFromRequest(request) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#1C1340" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { locale } = useLoaderData<typeof loader>();
  return (
    <ThemeProvider>
      <I18nProvider initialLocale={locale}>
        <NotificationProvider>
          <Outlet />
        </NotificationProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const locale: Locale = DEFAULT_LOCALE;
  let message = translate(locale, "errors.oops");
  let details = translate(locale, "errors.unexpected");

  if (isRouteErrorResponse(error)) {
    message =
      error.status === 404
        ? translate(locale, "errors.notFoundStatus")
        : translate(locale, "errors.error");
    details =
      error.status === 404
        ? translate(locale, "errors.pageNotFound")
        : error.statusText || details;
  } else if (
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV &&
    error instanceof Error
  ) {
    details = error.message;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-page px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-6 text-center shadow-sm sm:p-10">
        <h1 className="text-2xl font-bold text-ink">{message}</h1>
        <p className="mt-2 text-sm text-muted">{details}</p>
      </div>
    </main>
  );
}
