import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` is configurable so the same build works on GitHub Pages
// (https://<user>.github.io/<repo>/) and on a local preview server.
export default defineConfig({
  base: process.env.LUMENLAB_BASE ?? "/",
  plugins: [react()],
  server: { port: 5173, strictPort: false },
  preview: { port: 4173 },
  build: { target: "es2022", sourcemap: true },
});
