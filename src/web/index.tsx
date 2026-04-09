/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { raw } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";
import { parse as parseYaml } from "yaml";
import { useStorage } from "nitro/storage";

const app = new Hono();

const Layout: FC<PropsWithChildren<{ css: string }>> = ({ css, children }) => (
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

async function loadZones(): Promise<{ domain: string; subdomains: string[] }[]> {
  const storage = useStorage("assets/zones");
  const subdomains: string[] = [];

  for (const filename of await storage.getKeys()) {
    if (filename === "_zone.yaml") continue;
    if (!filename.endsWith(".yaml")) continue;
    const content = (await storage.getItem(filename)) as string;
    const parsed = parseYaml(content) as { show_on_web?: boolean };
    if (parsed?.show_on_web !== undefined && !parsed.show_on_web) continue;
    subdomains.push(filename.replace(/\.yaml$/, ""));
  }

  subdomains.sort();
  return [{ domain: "purduehackers.com", subdomains }];
}

app.get("/api/zones", async (c) => {
  const zones = await loadZones();
  return c.json(zones);
});

app.get("/", async (c) => {
  const storage = useStorage("assets/web");
  const css = (await storage.getItem("style.css")) as string;
  const clientScript = (await storage.getItem("client.js")) as string;

  return c.html(
    <Layout css={css}>
      <div id="app" />
      <script>{raw(clientScript)}</script>
    </Layout>,
  );
});

export default app;
