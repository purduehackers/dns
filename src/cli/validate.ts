import { loadConfig } from "../config.ts";
import { discoverZones, parseZoneDir } from "../zone/parser.ts";
import { validateZone } from "../zone/validator.ts";
import * as log from "../util/logger.ts";
import { join } from "node:path";

export async function runValidate(): Promise<boolean> {
  const config = await loadConfig();
  const zones = await discoverZones(config.settings.zones_dir);
  let hasErrors = false;

  for (const zoneName of zones) {
    const zoneDir = join(config.settings.zones_dir, zoneName);
    try {
      const parsed = await parseZoneDir(zoneDir);
      const errors = validateZone(parsed);

      if (errors.length > 0) {
        hasErrors = true;
        log.error(`${zoneName}: ${errors.length} error(s)`);
        for (const err of errors) {
          log.error(`  ${err.message}`);
        }
      } else {
        log.success(`${zoneName}: ${parsed.records.length} records OK`);
      }
    } catch (e) {
      hasErrors = true;
      log.error(`${zoneName}: ${(e as Error).message}`);
    }
  }

  return !hasErrors;
}
