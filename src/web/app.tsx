import { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

interface Zone {
  domain: string;
  subdomains: string[];
}

const STORAGE_KEY = "sitemap-visited";

function getVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveVisited(visited: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]));
}

function App() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [visited, setVisited] = useState(getVisited);

  useEffect(() => {
    void fetch("/api/zones")
      .then((r) => r.json())
      .then(setZones);
  }, []);

  const handleClick = useCallback((subdomain: string) => {
    setVisited((prev) => {
      const next = new Set(prev);
      next.add(subdomain);
      saveVisited(next);
      return next;
    });
  }, []);

  if (!zones) return null;

  const total = zones.reduce((n, z) => n + z.subdomains.length, 0);
  const count = zones.reduce(
    (n, z) => n + z.subdomains.filter((s) => visited.has(`${s}.${z.domain}`)).length,
    0,
  );
  const allVisited = total > 0 && count === total;

  return (
    <div>
      <h1>Purdue Hackers Sitemap</h1>
      <p className="description">
        All subdomains on *.purduehackers.com, generated from our DNS configuration as code!{" "}
        <a href="https://github.com/purduehackers/dns" target="_blank" rel="noopener noreferrer">
          View on GitHub
        </a>
      </p>
      {allVisited && <p className="congrats">You explored all {total} Purdue Hackers websites!</p>}
      <div className="zones">
        {zones.map((zone) => {
          const zoneTotal = zone.subdomains.length;
          const zoneCount = zone.subdomains.filter((s) =>
            visited.has(`${s}.${zone.domain}`),
          ).length;
          return (
            <div key={zone.domain}>
              <div className="zone-domain">
                {zone.domain}
                {zoneCount > 0 && (
                  <span className="visited-count">
                    ({zoneCount}/{zoneTotal})
                  </span>
                )}
              </div>
              <div className="subdomains">
                {zone.subdomains.map((sub) => {
                  const full = `${sub}.${zone.domain}`;
                  return (
                    <div className="subdomain" key={sub}>
                      <a
                        href={`https://${full}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleClick(full)}
                      >
                        {full}
                      </a>
                      {visited.has(full) && <span className="checkmark">&#x2713;</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<App />);
