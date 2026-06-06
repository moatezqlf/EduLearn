import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward /api calls to Express during dev
      "/api": { target: "http://localhost:5000", changeOrigin: true },
    },
  },
});
