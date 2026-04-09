import { test, expect, describe } from "bun:test";
import { DnsRecordType } from "../enums.ts";
import { validZoneDir } from "../util/fixtures.ts";
import { parseZoneConfig, parseSubdomainFile, parseZoneDir, discoverZones } from "./parser.ts";

describe("parseZoneConfig", () => {
  test("parses provider, TTL, and apex records", () => {
    const { provider, defaultTtl, records } = parseZoneConfig(`
provider: cloudflare
ttl: 600
records:
  - type: A
    value: 1.2.3.4
`);
    expect(provider).toBe("cloudflare");
    expect(defaultTtl).toBe(600);
    expect(records).toHaveLength(1);
    expect(records[0]!.name).toBe("@");
    expect(records[0]!.ttl).toBe(600);
  });

  test("defaults TTL to 300", () => {
    expect(parseZoneConfig("provider: cloudflare\n").defaultTtl).toBe(300);
  });

  test("handles zone with no records", () => {
    expect(parseZoneConfig("provider: cloudflare\nttl: 300\n").records).toHaveLength(0);
  });

  test("normalizes values array into multiple records", () => {
    const { records } = parseZoneConfig(`
provider: cloudflare
records:
  - type: A
    values:
      - 1.1.1.1
      - 2.2.2.2
`);
    expect(records).toHaveLength(2);
    expect(records[0]!.value).toBe("1.1.1.1");
    expect(records[1]!.value).toBe("2.2.2.2");
  });
});

describe("parseSubdomainFile", () => {
  test("derives name from argument", () => {
    const records = parseSubdomainFile(
      `
records:
  - type: CNAME
    value: x.com.
`,
      "www",
      300,
    );
    expect(records[0]!.name).toBe("www");
  });

  test("per-record TTL overrides default", () => {
    const records = parseSubdomainFile(
      `
records:
  - type: A
    value: 1.2.3.4
    ttl: 3600
`,
      "mail",
      300,
    );
    expect(records[0]!.ttl).toBe(3600);
  });

  test("parses priority/weight/port", () => {
    const records = parseSubdomainFile(
      `
records:
  - type: SRV
    value: sip.x.com.
    priority: 10
    weight: 60
    port: 5060
`,
      "_sip._tcp",
      300,
    );
    expect(records[0]!.priority).toBe(10);
    expect(records[0]!.weight).toBe(60);
    expect(records[0]!.port).toBe(5060);
  });

  test("handles empty file gracefully", () => {
    expect(parseSubdomainFile("", "empty", 300)).toHaveLength(0);
  });
});

describe("parseZoneDir", () => {
  test("loads and merges apex + subdomain files", async () => {
    const zone = await parseZoneDir(validZoneDir());
    expect(zone.domain).toBe("valid-zone");
    expect(zone.provider).toBe("cloudflare");
    expect(zone.records).toHaveLength(5);

    const www = zone.records.find((r) => r.name === "www");
    expect(www).toEqual({
      name: "www",
      type: DnsRecordType.CNAME,
      value: "example.com.",
      ttl: 300,
    });

    const mail = zone.records.find((r) => r.name === "mail");
    expect(mail!.ttl).toBe(3600);
  });

  test("throws on missing _zone.yaml", async () => {
    expect(parseZoneDir("fixtures")).rejects.toThrow("_zone.yaml");
  });
});

describe("discoverZones", () => {
  test("finds all zone directories", async () => {
    const zones = await discoverZones("zones");
    expect(zones).toContain("purduehackers.com");
    expect(zones).toContain("phack.rs");
    expect(zones).toContain("sig.horse");
    expect(zones).toContain("phack.sh");
  });
});
