import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: "build",
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
  define: {
    "import.meta.env.VITE_BUILD_DATE": JSON.stringify(
      process.env.VITE_BUILD_DATE || new Date().toISOString()
    ),
  },
});
