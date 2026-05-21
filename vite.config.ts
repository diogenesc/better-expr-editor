import { defineConfig } from "vite"

export default defineConfig({
  build: {
    target: "es2020",
    outDir: "dist",
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
})
