import { parseZoneDir } from "../zone/parser.ts";
import { loadConfig } from "../config.ts";
import index from "./index.html";

const config = await loadConfig();
const PORT = Number(process.env.PORT) || 3000;

Bun.serve({
  port: PORT,
  routes: {
    "/": index,
    "/api/zones": async () => {
      const domain = "purduehackers.com";
      const parsed = await parseZoneDir(`${config.settings.zones_dir}/${domain}`);
      const visibleRecords = parsed.records.filter((r) => r.show_on_web ?? true);
      const subdomains = [
        ...new Set(visibleRecords.map((r) => r.name).filter((n) => n !== "@")),
      ].sort();
      return Response.json([{ domain, subdomains }]);
    },
  },
});

console.log(`DNS viewer running at http://localhost:${PORT}`);
