import { YAML } from "bun";
import { ConfigError } from "./errors.ts";
import type { Config } from "./types.ts";

export async function loadConfig(path = "dns.yaml"): Promise<Config> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new ConfigError("Config file not found", { path });
  }

  const text = await file.text();
  const raw = YAML.parse(text) as Record<string, unknown>;

  const settings = (raw.settings as Config["settings"]) ?? {
    zones_dir: "zones",
    delete_threshold: 0.33,
    lenient: false,
  };
  settings.zones_dir ??= "zones";
  settings.delete_threshold ??= 0.33;
  settings.lenient ??= false;

  const providers = (raw.providers as Config["providers"]) ?? {};

  return { settings, providers };
}
