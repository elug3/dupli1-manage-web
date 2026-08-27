import type { Route } from "./+types/auth.session.gateway";
import { handleSessionGatewayProxy } from "~/lib/server/auth-session";

/**
 * Splat proxy mounted at `auth/session/gateway/*` (see app/routes.ts). Requests here carry
 * no token from the browser — only the httpOnly `dupli1_sid` cookie. `handleSessionGatewayProxy`
 * resolves that cookie to a session, exchanges its stored refresh token for a short-lived RS256
 * access token (cached server-side until ~30s before `exp`, see auth-session.ts), strips the
 * `/auth/session/gateway` prefix, and forwards the remainder to the real nginx gateway
 * (`/auth`, `/product`, `/inventory`, or `/order`) with `Authorization: Bearer <token>` attached.
 *
 * This route only attaches a valid token — it does not itself authorize the request. The
 * dupli1 backend enforces access via the JWT's `permissions` claim (fine-grained
 * `{resource}.{action}` strings issued by the auth service; see dupli1/docs/permissions.md),
 * which each downstream service validates independently.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return handleSessionGatewayProxy(request);
}

export async function action({ request }: Route.ActionArgs) {
  return handleSessionGatewayProxy(request);
}
