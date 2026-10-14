import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5174,
    watch: { ignored: ["**/local/**", "**/asset-sources/**"] },
  },
  optimizeDeps: { entries: ["index.html"] },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
        },
      },
    },
  },
});
