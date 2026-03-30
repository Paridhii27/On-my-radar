import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // GitHub Pages serves under /<repo>/, so use relative asset paths.
  // If you later move to a custom domain at the root, you can switch back to "/".
  base: "/On-my-radar/",
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
