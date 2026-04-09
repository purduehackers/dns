import { Hono } from "hono";
import { raw } from "hono/html";
import type { FC } from "hono/jsx";
import { YAML } from "bun";
import css from "./style.css" with { type: "text" };
import clientScript from "./client.js" with { type: "text" };
import zoneFiles from "zone-files";

const app = new Hono();

const domain = "purduehackers.com";
const subdomains: string[] = [];
for (const [filename, content] of Object.entries(zoneFiles)) {
  if (filename === "_zone.yaml") continue;
  const parsed = YAML.parse(content) as { show_on_web?: boolean };
  if (parsed?.show_on_web !== undefined && !parsed.show_on_web) continue;
  subdomains.push(filename.replace(/\.yaml$/, ""));
}
subdomains.sort();
const zones = [{ domain, subdomains }];

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

app.get("/api/zones", (c) => c.json(zones));

app.get("/", (c) => {
  return c.html(
    <Layout>
      <div id="app" />
      <script>{raw(clientScript)}</script>
    </Layout>,
  );
});

export default app;
