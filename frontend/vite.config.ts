import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// During development the Django API runs on :8000 (python manage.py runserver).
const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/admin": backend,
      "/static": backend,
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
});
