import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Node.js нужен только для инструментов фронтенда. Все API обрабатывает Python.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "DECKLY_");
  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": env.DECKLY_API_TARGET || "http://127.0.0.1:8000",
      },
    },
  };
});
