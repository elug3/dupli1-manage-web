import { handleSessionRefresh } from "~/lib/server/auth-session";
export async function action({ request }) {
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }
    return handleSessionRefresh(request);
}
