/**
 * Live stream for the `/support` inbox, proxied with the operator's token.
 *
 * Support's frames carry ids only — never a shopper's words — and the page
 * reloads through its loader on each one, so the transcript still comes only
 * from the SSR loader. This route is deliberately narrower than the session
 * gateway: it reaches the inbox stream and nothing else in support.
 */
import { openInboxStream } from "~/lib/server/support.server";
import type { Route } from "./+types/support.events";

export async function loader({ request }: Route.LoaderArgs) {
  let upstream: Response;
  try {
    upstream = await openInboxStream(request);
  } catch {
    return new Response("stream unavailable", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    // EventSource sees only "closed"; the page falls back to its own reload.
    return new Response(null, { status: upstream.status === 401 ? 401 : 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
