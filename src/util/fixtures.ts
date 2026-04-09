import { DnsRecordType } from "../enums.ts";
import type { DnsRecord, ParsedZone } from "../types.ts";

export function rec(
  overrides: Partial<DnsRecord> & { type: DnsRecordType; value: string },
): DnsRecord {
  return { name: "@", ttl: 300, ...overrides };
}

export function zone(...records: DnsRecord[]): ParsedZone {
  return {
    domain: "test.com",
    defaultTtl: 300,
    provider: "cloudflare",
    records,
  };
}

export function validZoneDir() {
  return "fixtures/valid-zone";
}

export function invalidZoneDir() {
  return "fixtures/invalid-zone";
}
