import { defineConfig } from "nitro";

export default defineConfig({
  routes: {
    "/**": "./src/web/index.tsx",
  },
  serverAssets: [
    {
      baseName: "zones",
      dir: "./zones/purduehackers.com",
    },
    {
      baseName: "web",
      dir: "./src/web/assets",
    },
  ],
});
