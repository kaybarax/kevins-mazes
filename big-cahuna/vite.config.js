import { defineConfig } from "vite";
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        ws: true,
        changeOrigin: true,
        configure(proxy) {
          const localOrigin = (request) =>
            request.setHeader("Origin", "http://127.0.0.1:8787");
          proxy.on("proxyReq", localOrigin);
          proxy.on("proxyReqWs", localOrigin);
        },
      },
    },
  },
});
