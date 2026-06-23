import { handleSessionMe } from "~/lib/server/auth-session";
export async function loader({ request }) {
    return handleSessionMe(request);
}
