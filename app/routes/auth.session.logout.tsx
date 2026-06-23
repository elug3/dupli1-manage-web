import type { Route } from "./+types/auth.session.logout";
import { handleSessionLogout } from "~/lib/server/auth-session";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  return handleSessionLogout(request);
}
