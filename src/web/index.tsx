import { Hono } from "hono";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { parseZoneDir } from "../zone/parser.ts";
import { loadConfig } from "../config.ts";
import css from "./style.css" with { type: "text" };
import clientScript from "./client.js" with { type: "text" };

const config = await loadConfig();
const app = new Hono();

const Layout: FC = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Purdue Hackers Sitemap</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap"
        rel="stylesheet"
      />
      <style>{raw(css)}</style>
    </head>
    <body>{children}</body>
  </html>
);

app.get("/api/zones", async (c) => {
  const domain = "purduehackers.com";
  const parsed = await parseZoneDir(`${config.settings.zones_dir}/${domain}`);
  const visibleRecords = parsed.records.filter((r) => r.show_on_web ?? true);
  const subdomains = [
    ...new Set(visibleRecords.map((r) => r.name).filter((n) => n !== "@")),
  ].sort();
  return c.json([{ domain, subdomains }]);
});

app.get("/", (c) => {
  return c.html(
    <Layout>
      <div id="app" />
      <script>{raw(clientScript)}</script>
    </Layout>,
  );
});

export default app;
