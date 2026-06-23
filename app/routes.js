import { index, layout, route, } from "@react-router/dev/routes";
export default [
    route("auth/session/login", "routes/auth.session.login.tsx"),
    route("auth/session/refresh", "routes/auth.session.refresh.tsx"),
    route("auth/session/logout", "routes/auth.session.logout.tsx"),
    route("login", "routes/login.tsx"),
    layout("routes/admin.tsx", [
        index("routes/dashboard.tsx"),
        route("products", "routes/products.tsx"),
        route("products/new", "routes/products.new.tsx"),
        route("products/:id", "routes/products.$id.tsx"),
        route("orders", "routes/orders.tsx"),
        route("coupons", "routes/coupons.tsx"),
        route("analytics", "routes/analytics.tsx"),
        route("users", "routes/users.tsx"),
        route("settings", "routes/settings.tsx"),
    ]),
];
