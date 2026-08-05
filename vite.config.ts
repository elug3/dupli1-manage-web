import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
) as { version: string };

const appVersion = process.env.APP_VERSION || pkg.version;
const appBuildNumber = process.env.APP_BUILD_NUMBER || "dev";
const appGitSha = process.env.APP_GIT_SHA || "local";

/** Strip gateway prefix so upstream receives paths as documented. */
function stripGatewayPrefix(prefix: string) {
  return (path: string) => path.replace(new RegExp(`^${prefix}`), "") || "/";
}

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_NUMBER__: JSON.stringify(appBuildNumber),
    __APP_GIT_SHA__: JSON.stringify(appGitSha),
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    proxy: {
      // Trailing slash matters: Vite matches proxy keys by plain string prefix, so
      // "/product" without it would also swallow page routes like /products and
      // /products/new. /auth/session/* is handled by React Router, not proxied.
      "/auth/api/": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: stripGatewayPrefix("/auth"),
      },
      "/product/": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: stripGatewayPrefix("/product"),
      },
      "/inventory/": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: stripGatewayPrefix("/inventory"),
      },
      "/order/": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: stripGatewayPrefix("/order"),
      },
      "/notification/": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: stripGatewayPrefix("/notification"),
      },
      // Product images: gateway path is already `/product-images/…` (no prefix strip).
      "/product-images/": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
