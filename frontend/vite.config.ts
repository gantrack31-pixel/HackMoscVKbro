import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Node.js нужен только для инструментов фронтенда. Все API обрабатывает Python.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
});
