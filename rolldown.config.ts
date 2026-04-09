import { defineConfig } from "rolldown";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export default defineConfig({
  input: "src/web/index.tsx",
  output: {
    dir: "dist",
    format: "esm",
  },
  platform: "node",
  external: [/^hono/, /^node:/, "bun"],
  plugins: [
    {
      name: "text-import",
      resolveId(source, importer) {
        if (importer && (source.endsWith(".css") || source.endsWith(".js"))) {
          const dir = dirname(importer);
          const resolved = resolve(dir, source);
          return { id: resolved + "?text", external: false };
        }
      },
      load(id) {
        if (id.endsWith("?text")) {
          const filePath = id.replace(/\?text$/, "");
          const content = readFileSync(filePath, "utf-8");
          return { code: `export default ${JSON.stringify(content)};`, moduleType: "js" };
        }
      },
    },
  ],
});
