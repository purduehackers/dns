import { defineConfig } from "rolldown";
import { readFileSync, readdirSync } from "node:fs";
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
      name: "zone-files",
      resolveId(source) {
        if (source === "zone-files") return { id: "zone-files", external: false };
      },
      load(id) {
        if (id !== "zone-files") return;
        const dir = "zones/purduehackers.com";
        const entries: Record<string, string> = {};
        for (const f of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
          entries[f] = readFileSync(`${dir}/${f}`, "utf-8");
        }
        return { code: `export default ${JSON.stringify(entries)};`, moduleType: "js" };
      },
    },
    {
      name: "text-files",
      resolveId(source, importer) {
        if (importer && (source.endsWith(".css") || source.endsWith(".js"))) {
          return { id: resolve(dirname(importer), source) + "?text", external: false };
        }
      },
      load(id) {
        if (!id.endsWith("?text")) return;
        const content = readFileSync(id.replace(/\?text$/, ""), "utf-8");
        return { code: `export default ${JSON.stringify(content)};`, moduleType: "js" };
      },
    },
  ],
});
