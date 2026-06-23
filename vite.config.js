import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
/** Strip gateway prefix so upstream receives paths as documented. */
function stripGatewayPrefix(prefix) {
    return (path) => path.replace(new RegExp(`^${prefix}`), "") || "/";
}
export default defineConfig({
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
        tsconfigPaths: true,
    },
    server: {
        proxy: {
            "/auth": {
                target: "http://localhost:8080",
                changeOrigin: true,
                rewrite: stripGatewayPrefix("/auth"),
            },
            "/product": {
                target: "http://localhost:8080",
                changeOrigin: true,
                rewrite: stripGatewayPrefix("/product"),
            },
            "/inventory": {
                target: "http://localhost:8080",
                changeOrigin: true,
                rewrite: stripGatewayPrefix("/inventory"),
            },
            "/order": {
                target: "http://localhost:8080",
                changeOrigin: true,
                rewrite: stripGatewayPrefix("/order"),
            },
        },
    },
});
