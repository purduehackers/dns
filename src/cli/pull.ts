import { loadConfig } from "../config.ts";
import { discoverZones, parseZoneDir } from "../zone/parser.ts";
import { createProvider } from "../provider/registry.ts";
import { diffRecords, summarize } from "../engine/diff.ts";
import { formatRecord } from "../util/dns.ts";
import type { Config, DnsRecord } from "../types.ts";
import { DiffAction, DnsRecordType } from "../enums.ts";
import * as log from "../util/logger.ts";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** Group records by subdomain name */
function groupByName(records: DnsRecord[]): Map<string, DnsRecord[]> {
  const groups = new Map<string, DnsRecord[]>();
  for (const r of records) {
    const existing = groups.get(r.name);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(r.name, [r]);
    }
  }
  return groups;
}

/** Format a record's value for YAML, handling MX priority embedding */
function formatValue(r: DnsRecord): string {
  if (r.type === DnsRecordType.MX && r.priority !== undefined) {
    return `${r.priority} ${r.value}`;
  }
  return r.value;
}

/** Serialize a record to a YAML entry string */
function recordToYaml(r: DnsRecord, defaultTtl: number): string {
  const value = formatValue(r);
  const lines: string[] = [];
  const needsQuote = value.includes(":") || value.includes("#") || value.startsWith('"');
  lines.push(`  - type: ${r.type}`);
  lines.push(`    value: ${needsQuote ? `'${value}'` : value}`);
  if (r.ttl !== defaultTtl) {
    lines.push(`    ttl: ${r.ttl}`);
  }
  if (r.proxied) {
    lines.push(`    proxied: true`);
  }
  if (r.type === DnsRecordType.SRV) {
    if (r.priority !== undefined) lines.push(`    priority: ${r.priority}`);
    if (r.weight !== undefined) lines.push(`    weight: ${r.weight}`);
    if (r.port !== undefined) lines.push(`    port: ${r.port}`);
  }
  if (r.comment) {
    lines.push(`    comment: ${r.comment}`);
  }
  return lines.join("\n");
}

/** Generate _zone.yaml content */
function generateZoneYaml(provider: string, defaultTtl: number, apexRecords: DnsRecord[]): string {
  const lines: string[] = [];
  lines.push(`provider: ${provider}`);
  lines.push(`ttl: ${defaultTtl}`);
  if (apexRecords.length > 0) {
    lines.push("");
    lines.push("records:");
    for (const r of apexRecords) {
      lines.push(recordToYaml(r, defaultTtl));
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** Generate a subdomain yaml file content */
function generateSubdomainYaml(records: DnsRecord[], defaultTtl: number): string {
  const lines: string[] = ["records:"];
  for (const r of records) {
    lines.push(recordToYaml(r, defaultTtl));
  }
  lines.push("");
  return lines.join("\n");
}

/** Compute the most common TTL from a set of records */
function computeDefaultTtl(records: DnsRecord[]): number {
  const counts = new Map<number, number>();
  for (const r of records) {
    counts.set(r.ttl, (counts.get(r.ttl) ?? 0) + 1);
  }
  let best = 1;
  let bestCount = 0;
  for (const [ttl, count] of counts) {
    if (count > bestCount) {
      best = ttl;
      bestCount = count;
    }
  }
  return best;
}

interface PullPlan {
  zoneName: string;
  provider: string;
  remoteRecords: DnsRecord[];
  localRecords: DnsRecord[];
  defaultTtl: number;
  zoneDir: string;
  isNew: boolean;
  summary: { creates: number; updates: number; deletes: number; noops: number };
  entries: ReturnType<typeof diffRecords>;
}

async function buildPullPlan(config: Config, zoneName: string): Promise<PullPlan | null> {
  const existingZones = await discoverZones(config.settings.zones_dir);
  const isNew = !existingZones.includes(zoneName);
  const zoneDir = join(config.settings.zones_dir, zoneName);

  let providerName: string;
  let localRecords: DnsRecord[] = [];

  if (isNew) {
    // For new zones, use the first provider
    const firstProvider = Object.keys(config.providers)[0];
    if (!firstProvider) {
      log.error(`${zoneName}: No providers configured`);
      return null;
    }
    providerName = firstProvider;
  } else {
    const parsed = await parseZoneDir(zoneDir);
    providerName = parsed.provider;
    localRecords = parsed.records;
  }

  const providerConfig = config.providers[providerName];
  if (!providerConfig) {
    log.error(`${zoneName}: Provider '${providerName}' not found in config`);
    return null;
  }

  const provider = createProvider(providerName, providerConfig);

  let remoteRecords: DnsRecord[];
  try {
    remoteRecords = await provider.listRecords(zoneName);
  } catch {
    log.error(`${zoneName}: Zone not found in provider '${providerName}'`);
    return null;
  }

  const defaultTtl = computeDefaultTtl(remoteRecords);

  // Diff: remote is "desired", local is "existing" — what would change locally
  const entries = diffRecords(remoteRecords, localRecords);
  const summary = summarize(entries);

  return {
    zoneName,
    provider: providerName,
    remoteRecords,
    localRecords,
    defaultTtl,
    zoneDir,
    isNew,
    summary,
    entries,
  };
}

function printPlanDiff(pullPlan: PullPlan): void {
  log.bold(`\n${pullPlan.zoneName}${pullPlan.isNew ? " (new)" : ""}:`);
  for (const entry of pullPlan.entries) {
    if (entry.action === DiffAction.Noop) continue;
    const record = entry.desired ?? entry.existing!;
    switch (entry.action) {
      case DiffAction.Create:
        log.create(formatRecord(record));
        break;
      case DiffAction.Update:
        log.update(`${formatRecord(entry.existing!)} → ${formatRecord(entry.desired!)}`);
        break;
      case DiffAction.Delete:
        log.del(formatRecord(record));
        break;
    }
  }
  const s = pullPlan.summary;
  log.info(`${s.creates} create, ${s.updates} update, ${s.deletes} delete`);
}

async function confirmPull(): Promise<boolean> {
  process.stdout.write("\nPull these changes into zone files? [y/N] ");
  const response = await new Promise<string>((resolve) => {
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  });
  process.stdin.unref();
  return response.toLowerCase() === "y";
}

export async function runPull(zoneFilter?: string, autoConfirm = false): Promise<void> {
  const config = await loadConfig();
  const existingZones = await discoverZones(config.settings.zones_dir);
  const zonesToPull = zoneFilter ? [zoneFilter] : existingZones;

  if (zonesToPull.length === 0) {
    log.warn("No zones found to pull.");
    return;
  }

  const plans = (await Promise.all(zonesToPull.map((z) => buildPullPlan(config, z)))).filter(
    (p): p is PullPlan => p !== null,
  );

  const hasChanges = plans.some(
    (p) => p.summary.creates + p.summary.updates + p.summary.deletes > 0,
  );

  if (hasChanges) {
    for (const pullPlan of plans) {
      if (pullPlan.summary.creates + pullPlan.summary.updates + pullPlan.summary.deletes > 0) {
        printPlanDiff(pullPlan);
      }
    }
    if (!autoConfirm && !(await confirmPull())) {
      log.warn("Aborted.");
      return;
    }
  }

  // Always write zone files to sync metadata (proxied, comments)
  for (const pullPlan of plans) {
    if (pullPlan.isNew) {
      mkdirSync(pullPlan.zoneDir, { recursive: true });
    }
    await writeZoneFiles(
      pullPlan.zoneDir,
      pullPlan.provider,
      pullPlan.defaultTtl,
      pullPlan.remoteRecords,
    );
    log.success(`${pullPlan.zoneName}: Pulled ${pullPlan.remoteRecords.length} records`);
  }
}

async function writeZoneFiles(
  zoneDir: string,
  provider: string,
  defaultTtl: number,
  records: DnsRecord[],
): Promise<void> {
  const grouped = groupByName(records);

  const apexRecords = grouped.get("@") ?? [];
  grouped.delete("@");
  await Bun.write(join(zoneDir, "_zone.yaml"), generateZoneYaml(provider, defaultTtl, apexRecords));

  // Collect existing subdomain files
  const glob = new Bun.Glob("*.yaml");
  const existingFiles = new Set<string>();
  for await (const f of glob.scan(zoneDir)) {
    if (f !== "_zone.yaml") existingFiles.add(f);
  }

  // Write subdomain files
  const writtenFiles = new Set<string>();
  for (const [name, recs] of grouped) {
    const filename = `${name}.yaml`;
    writtenFiles.add(filename);
    await Bun.write(join(zoneDir, filename), generateSubdomainYaml(recs, defaultTtl));
  }

  // Remove stale files
  const { unlinkSync } = await import("node:fs");
  for (const f of existingFiles) {
    if (!writtenFiles.has(f)) {
      unlinkSync(join(zoneDir, f));
      log.dim(`  Removed ${f}`);
    }
  }
}
