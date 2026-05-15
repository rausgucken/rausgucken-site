// astro.config.mjs
import { defineConfig } from "astro/config";
export default defineConfig({
  site: "https://www.rausgucken.de",
  trailingSlash: "never",
  output: "static",
  build: {
    assets: "_assets",
  },
});
