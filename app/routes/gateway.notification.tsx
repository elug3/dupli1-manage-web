import type { Route } from "./+types/gateway.notification";
import { proxyGatewayRequest } from "~/lib/server/gateway-proxy";

export async function loader({ request }: Route.LoaderArgs) {
  return proxyGatewayRequest(request);
}

export async function action({ request }: Route.ActionArgs) {
  return proxyGatewayRequest(request);
}
