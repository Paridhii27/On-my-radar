import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        thoughtClouds: resolve(root, "thought-clouds.html"),
        fieldSignal: resolve(root, "field-signal.html"),
        signalScouter: resolve(root, "signal-scouter.html"),
      },
    },
  },
});
