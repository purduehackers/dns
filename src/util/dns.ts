import { DnsRecordType } from "../enums.ts";
import type { DnsRecord } from "../types.ts";

/** Composite key for matching records: (name, type, value) + priority for MX/SRV */
export function recordKey(r: DnsRecord): string {
  const base = `${r.name}|${r.type}|${r.value}`;
  if (r.type === DnsRecordType.MX || r.type === DnsRecordType.SRV) {
    return `${base}|${r.priority ?? 0}`;
  }
  return base;
}

/** Check if two records are identical (same key + same metadata) */
export function recordsEqual(a: DnsRecord, b: DnsRecord): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.value === b.value &&
    a.ttl === b.ttl &&
    (a.proxied ?? false) === (b.proxied ?? false) &&
    a.priority === b.priority &&
    a.weight === b.weight &&
    a.port === b.port
  );
}

/** Format a record for display */
export function formatRecord(r: DnsRecord): string {
  const name = r.name === "@" ? "(apex)" : r.name;
  const extra: string[] = [];
  if (r.proxied) extra.push("proxied");
  if (r.priority !== undefined) extra.push(`pri=${r.priority}`);
  if (r.weight !== undefined) extra.push(`w=${r.weight}`);
  if (r.port !== undefined) extra.push(`port=${r.port}`);
  if (r.comment) extra.push(r.comment);
  const suffix = extra.length > 0 ? ` [${extra.join(", ")}]` : "";
  return `${r.type} ${name} → ${r.value} (TTL ${r.ttl})${suffix}`;
}
