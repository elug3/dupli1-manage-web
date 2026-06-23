import type { Route } from "./+types/auth.session.me";
import { handleSessionMe } from "~/lib/server/auth-session";

export async function loader({ request }: Route.LoaderArgs) {
  return handleSessionMe(request);
}
