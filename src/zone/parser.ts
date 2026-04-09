import { YAML } from "bun";
import { Glob } from "bun";
import { join, basename } from "node:path";
import { DnsRecordType } from "../enums.ts";
import { ZoneParseError } from "../errors.ts";
import type { DnsRecord, ParsedZone } from "../types.ts";

const DEFAULT_TTL = 300;

interface RawRecord {
  type: string;
  value?: string;
  values?: string[];
  ttl?: number;
  proxied?: boolean;
  priority?: number;
  weight?: number;
  port?: number;
  comment?: string;
}

interface RawZoneConfig {
  provider: string;
  ttl?: number;
  records?: RawRecord[];
}

interface RawSubdomainFile {
  records?: RawRecord[];
  show_on_web?: boolean;
}

function normalizeValues(raw: RawRecord): string[] {
  if (raw.values) return raw.values;
  if (raw.value) return [raw.value];
  return [];
}

function toRecords(name: string, raw: RawRecord, defaultTtl: number): DnsRecord[] {
  const type = raw.type.toUpperCase() as DnsRecordType;
  const ttl = raw.ttl ?? defaultTtl;
  const values = normalizeValues(raw);

  return values.map((v) => {
    let value = v;
    const record: DnsRecord = { name, type, value, ttl };

    // MX: split "priority target" into separate fields
    if (type === DnsRecordType.MX && raw.priority === undefined) {
      const parts = v.split(" ");
      if (parts.length === 2) {
        const prio = Number.parseInt(parts[0]!, 10);
        if (!Number.isNaN(prio)) {
          record.priority = prio;
          record.value = parts[1]!;
        }
      }
    }

    if (raw.proxied) record.proxied = true;
    if (raw.priority !== undefined) record.priority = raw.priority;
    if (raw.weight !== undefined) record.weight = raw.weight;
    if (raw.port !== undefined) record.port = raw.port;
    if (raw.comment) record.comment = raw.comment;
    return record;
  });
}

/** Parse a _zone.yaml file — returns zone config + apex records */
export function parseZoneConfig(yaml: string): {
  provider: string;
  defaultTtl: number;
  records: DnsRecord[];
} {
  const raw = YAML.parse(yaml) as RawZoneConfig;
  const defaultTtl = raw.ttl ?? DEFAULT_TTL;
  const records: DnsRecord[] = [];

  if (raw.records) {
    for (const entry of raw.records) {
      records.push(...toRecords("@", entry, defaultTtl));
    }
  }

  return { provider: raw.provider, defaultTtl, records };
}

/** Parse a subdomain file — filename determines the record name */
export function parseSubdomainFile(yaml: string, name: string, defaultTtl: number): DnsRecord[] {
  const raw = YAML.parse(yaml) as RawSubdomainFile;
  const records: DnsRecord[] = [];

  if (raw?.records) {
    for (const entry of raw.records) {
      records.push(...toRecords(name, entry, defaultTtl));
    }
  }

  if (raw?.show_on_web !== undefined) {
    for (const r of records) r.show_on_web = raw.show_on_web;
  }

  return records;
}

/** Load an entire zone directory into a ParsedZone */
export async function parseZoneDir(zoneDir: string): Promise<ParsedZone> {
  const domain = basename(zoneDir);

  // Read _zone.yaml
  const zoneFile = Bun.file(join(zoneDir, "_zone.yaml"));
  if (!(await zoneFile.exists())) {
    throw new ZoneParseError("Missing _zone.yaml", { zoneDir });
  }
  const zoneYaml = await zoneFile.text();
  const { provider, defaultTtl, records } = parseZoneConfig(zoneYaml);

  // Collect all files first, then read in parallel
  const glob = new Glob("*.yaml");
  const subdomainFiles: string[] = [];
  for await (const entry of glob.scan(zoneDir)) {
    if (entry !== "_zone.yaml") subdomainFiles.push(entry);
  }

  const fileContents = await Promise.all(
    subdomainFiles.map((f) => Bun.file(join(zoneDir, f)).text()),
  );

  for (let i = 0; i < subdomainFiles.length; i++) {
    const subdomain = subdomainFiles[i]!.replace(/\.yaml$/, "");
    records.push(...parseSubdomainFile(fileContents[i]!, subdomain, defaultTtl));
  }

  return { domain, defaultTtl, provider, records };
}

/** Discover all zone directories under the zones root */
export async function discoverZones(zonesDir: string): Promise<string[]> {
  const zones: string[] = [];
  const glob = new Glob("*/_zone.yaml");
  for await (const match of glob.scan(zonesDir)) {
    const domain = match.replace("/_zone.yaml", "");
    zones.push(domain);
  }
  return zones.sort();
}
