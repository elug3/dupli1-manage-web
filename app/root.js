import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, } from "react-router";
import "./app.css";
export const links = () => [
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
    },
    {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
    },
];
export function Layout({ children }) {
    return (_jsxs("html", { lang: "en", children: [_jsxs("head", { children: [_jsx("meta", { charSet: "utf-8" }), _jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" }), _jsx("meta", { name: "theme-color", content: "#1C1340" }), _jsx("meta", { name: "mobile-web-app-capable", content: "yes" }), _jsx("meta", { name: "apple-mobile-web-app-capable", content: "yes" }), _jsx("meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }), _jsx(Meta, {}), _jsx(Links, {})] }), _jsxs("body", { children: [children, _jsx(ScrollRestoration, {}), _jsx(Scripts, {})] })] }));
}
export default function App() {
    return _jsx(Outlet, {});
}
export function ErrorBoundary({ error }) {
    let message = "Oops!";
    let details = "An unexpected error occurred.";
    if (isRouteErrorResponse(error)) {
        message = error.status === 404 ? "404" : "Error";
        details =
            error.status === 404
                ? "The requested page could not be found."
                : error.statusText || details;
    }
    else if (import.meta.env?.DEV && error instanceof Error) {
        details = error.message;
    }
    return (_jsx("main", { className: "flex min-h-dvh items-center justify-center bg-[#F4F3F8] px-4", children: _jsxs("div", { className: "w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-sm sm:p-10", children: [_jsx("h1", { className: "text-2xl font-bold text-[#1C1B1F]", children: message }), _jsx("p", { className: "mt-2 text-sm text-[#6B6480]", children: details })] }) }));
}
