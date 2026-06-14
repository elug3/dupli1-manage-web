import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  layout("routes/admin.tsx", [
    index("routes/dashboard.tsx"),
    route("products", "routes/products.tsx"),
    route("orders", "routes/orders.tsx"),
    route("analytics", "routes/analytics.tsx"),
    route("users", "routes/users.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
