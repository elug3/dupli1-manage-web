import type { Route } from "./+types/auth.session.gateway";
import { handleSessionGatewayProxy } from "~/lib/server/auth-session";

export async function loader({ request }: Route.LoaderArgs) {
  return handleSessionGatewayProxy(request);
}

export async function action({ request }: Route.ActionArgs) {
  return handleSessionGatewayProxy(request);
}
