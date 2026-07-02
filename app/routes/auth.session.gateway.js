import { handleSessionGatewayProxy } from "~/lib/server/auth-session";
export async function loader({ request }) {
    return handleSessionGatewayProxy(request);
}
export async function action({ request }) {
    return handleSessionGatewayProxy(request);
}
