import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  plugins: [react(), tailwindcss(), tsconfigPaths({ projects: ["../tsconfig.json"] })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL("../desktop-web-dist", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
  },
});
