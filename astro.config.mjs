// astro.config.mjs
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://www.rausgucken.de",
  output: "static",
  build: {
    assets: "_assets",
  },
});
