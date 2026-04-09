import type { Config, DnsProvider, ExecutionPlan } from "../types.ts";
import { discoverZones, parseZoneDir } from "../zone/parser.ts";
import { validateZone } from "../zone/validator.ts";
import { diffRecords, summarize } from "./diff.ts";
import { checkDeleteThreshold, filterDeletes } from "./safety.ts";
import { createProvider } from "../provider/registry.ts";
import { ConfigError, ValidationError } from "../errors.ts";
import { join } from "node:path";

export async function buildPlan(
  config: Config,
  zoneName: string,
  provider: DnsProvider,
  opts: { checkSafety?: boolean } = {},
): Promise<ExecutionPlan> {
  const { checkSafety = false } = opts;
  const zoneDir = join(config.settings.zones_dir, zoneName);

  // Parse zone files and fetch existing records in parallel
  const [zone, existing] = await Promise.all([
    parseZoneDir(zoneDir),
    provider.listRecords(zoneName),
  ]);

  const errors = validateZone(zone);
  if (errors.length > 0) {
    throw new ValidationError("Zone validation failed", {
      zone: zoneName,
      errors: errors.map((e) => e.message),
    });
  }
  const entries = diffRecords(zone.records, existing);
  const summary = summarize(entries);

  let plan: ExecutionPlan = {
    zone: zoneName,
    provider: provider.name,
    entries,
    summary,
  };

  if (config.settings.lenient) {
    plan = filterDeletes(plan);
  }

  if (checkSafety) {
    checkDeleteThreshold(plan, config.settings.delete_threshold);
  }

  return plan;
}

export async function buildAllPlans(
  config: Config,
  zoneFilter?: string,
  opts: { checkSafety?: boolean } = {},
): Promise<ExecutionPlan[]> {
  const allZones = await discoverZones(config.settings.zones_dir);
  const zones = zoneFilter ? allZones.filter((z) => z === zoneFilter) : allZones;

  if (zones.length === 0) {
    throw new ConfigError("No zones found", {
      zoneFilter,
      zonesDir: config.settings.zones_dir,
    });
  }

  // Parse all zones in parallel to resolve providers
  const parsedZones = await Promise.all(
    zones.map(async (zoneName) => {
      const zoneDir = join(config.settings.zones_dir, zoneName);
      const zone = await parseZoneDir(zoneDir);
      return { zoneName, zone };
    }),
  );

  // Create providers (cheap, synchronous after first)
  const providers = new Map<string, DnsProvider>();
  for (const { zoneName, zone } of parsedZones) {
    if (!providers.has(zone.provider)) {
      const providerConfig = config.providers[zone.provider];
      if (!providerConfig) {
        throw new ConfigError("Provider not found in config", {
          provider: zone.provider,
          zone: zoneName,
        });
      }
      providers.set(zone.provider, createProvider(zone.provider, providerConfig));
    }
  }

  return Promise.all(
    zones.map((zoneName) => {
      const { zone } = parsedZones.find((p) => p.zoneName === zoneName)!;
      const provider = providers.get(zone.provider)!;
      return buildPlan(config, zoneName, provider, opts);
    }),
  );
}
