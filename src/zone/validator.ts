import { DnsRecordType } from "../enums.ts";
import type { DnsRecord, ParsedZone, ValidationError } from "../types.ts";

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;
const FQDN_RE = /^([a-zA-Z0-9_-]+\.)*[a-zA-Z0-9_-]+\.?$/;
const HOSTNAME_RE = /^([a-zA-Z0-9_*-]+\.)*[a-zA-Z0-9_*-]+$/;

function validateIPv4(value: string): string | null {
  if (!IPV4_RE.test(value)) return `Invalid IPv4 address: ${value}`;
  for (const octet of value.split(".")) {
    const n = Number.parseInt(octet, 10);
    if (n < 0 || n > 255) return `IPv4 octet out of range: ${octet}`;
  }
  return null;
}

function validateIPv6(value: string): string | null {
  if (!IPV6_RE.test(value)) return `Invalid IPv6 address: ${value}`;
  return null;
}

function validateFQDN(value: string): string | null {
  if (!FQDN_RE.test(value)) return `Invalid FQDN: ${value}`;
  return null;
}

function validateRecord(record: DnsRecord): string | null {
  // Validate name
  if (record.name !== "@" && !HOSTNAME_RE.test(record.name)) {
    return `Invalid record name: ${record.name}`;
  }

  switch (record.type) {
    case DnsRecordType.A:
      return validateIPv4(record.value);
    case DnsRecordType.AAAA:
      return validateIPv6(record.value);
    case DnsRecordType.CNAME:
      if (record.name === "@") return "CNAME records cannot be at apex";
      return validateFQDN(record.value);
    case DnsRecordType.MX: {
      // MX value format: "priority target" or just "target" with priority field
      const parts = record.value.split(" ");
      if (parts.length === 2) {
        const prio = Number.parseInt(parts[0]!, 10);
        if (Number.isNaN(prio) || prio < 0) return `Invalid MX priority: ${parts[0]}`;
        return validateFQDN(parts[1]!);
      }
      if (parts.length === 1) {
        return validateFQDN(record.value);
      }
      return `Invalid MX value: ${record.value}`;
    }
    case DnsRecordType.TXT:
      return null;
    case DnsRecordType.NS:
    case DnsRecordType.PTR:
      return validateFQDN(record.value);
    case DnsRecordType.SRV: {
      if (record.priority === undefined) return "SRV records require priority";
      if (record.weight === undefined) return "SRV records require weight";
      if (record.port === undefined) return "SRV records require port";
      return validateFQDN(record.value);
    }
    case DnsRecordType.CAA: {
      const parts = record.value.split(" ");
      if (parts.length < 3) return `Invalid CAA value: ${record.value}`;
      const flags = Number.parseInt(parts[0]!, 10);
      if (Number.isNaN(flags) || flags < 0 || flags > 255) return `Invalid CAA flags: ${parts[0]}`;
      return null;
    }
  }
}

export function validateZone(zone: ParsedZone): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for CNAME conflicts (CNAME at a name means no other records at that name)
  const cnameNames = new Set<string>();
  const otherNames = new Set<string>();

  for (const record of zone.records) {
    const err = validateRecord(record);
    if (err) {
      errors.push({ record, message: err });
    }

    if (record.type === DnsRecordType.CNAME) {
      cnameNames.add(record.name);
    } else {
      otherNames.add(record.name);
    }

    if (record.ttl < 1) {
      errors.push({ record, message: `TTL must be positive: ${record.ttl}` });
    }
  }

  // CNAME exclusivity check
  for (const name of cnameNames) {
    if (otherNames.has(name)) {
      errors.push({
        record: zone.records.find((r) => r.name === name && r.type === DnsRecordType.CNAME)!,
        message: `CNAME at '${name}' conflicts with other records at the same name`,
      });
    }
  }

  return errors;
}
