import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
export default defineConfig({
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
        tsconfigPaths: true,
    },
    server: {
        proxy: {
            "/api/v1": {
                target: "http://localhost:8080",
                changeOrigin: true,
            },
            "/health": {
                target: "http://localhost:8080",
                changeOrigin: true,
            },
            "/api": {
                target: "http://localhost:8081",
                changeOrigin: true,
            },
        },
    },
});
