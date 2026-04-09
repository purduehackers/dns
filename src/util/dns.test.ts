import { test, expect, describe } from "bun:test";
import { DnsRecordType } from "../enums.ts";
import { recordKey, recordsEqual, formatRecord } from "./dns.ts";
import { rec } from "./fixtures.ts";

describe("recordKey", () => {
  test("basic key for A record", () => {
    expect(recordKey(rec({ name: "www", type: DnsRecordType.A, value: "1.2.3.4" }))).toBe(
      "www|A|1.2.3.4",
    );
  });

  test("includes priority for MX", () => {
    expect(recordKey(rec({ type: DnsRecordType.MX, value: "10 mail.x.com.", priority: 10 }))).toBe(
      "@|MX|10 mail.x.com.|10",
    );
  });

  test("includes priority for SRV", () => {
    expect(
      recordKey(
        rec({
          name: "_sip._tcp",
          type: DnsRecordType.SRV,
          value: "s.com.",
          priority: 5,
        }),
      ),
    ).toBe("_sip._tcp|SRV|s.com.|5");
  });

  test("defaults priority to 0 for MX without priority", () => {
    expect(recordKey(rec({ type: DnsRecordType.MX, value: "mail.x.com." }))).toBe(
      "@|MX|mail.x.com.|0",
    );
  });
});

describe("recordsEqual", () => {
  test("identical records are equal", () => {
    const a = rec({ type: DnsRecordType.A, value: "1.2.3.4" });
    expect(recordsEqual(a, { ...a })).toBe(true);
  });

  test("different TTL is not equal", () => {
    const a = rec({ type: DnsRecordType.A, value: "1.2.3.4", ttl: 300 });
    const b = rec({ type: DnsRecordType.A, value: "1.2.3.4", ttl: 600 });
    expect(recordsEqual(a, b)).toBe(false);
  });

  test("different priority is not equal", () => {
    const a = rec({ type: DnsRecordType.MX, value: "m.com.", priority: 10 });
    const b = rec({ type: DnsRecordType.MX, value: "m.com.", priority: 20 });
    expect(recordsEqual(a, b)).toBe(false);
  });

  test("different proxied is not equal", () => {
    const a = rec({ type: DnsRecordType.A, value: "1.2.3.4", proxied: true });
    const b = rec({ type: DnsRecordType.A, value: "1.2.3.4" });
    expect(recordsEqual(a, b)).toBe(false);
  });

  test("both proxied is equal", () => {
    const a = rec({ type: DnsRecordType.A, value: "1.2.3.4", proxied: true });
    const b = rec({ type: DnsRecordType.A, value: "1.2.3.4", proxied: true });
    expect(recordsEqual(a, b)).toBe(true);
  });
});

describe("formatRecord", () => {
  test("formats apex record", () => {
    expect(formatRecord(rec({ type: DnsRecordType.A, value: "1.2.3.4" }))).toBe(
      "A (apex) → 1.2.3.4 (TTL 300)",
    );
  });

  test("formats subdomain record", () => {
    expect(formatRecord(rec({ name: "www", type: DnsRecordType.CNAME, value: "x.com." }))).toBe(
      "CNAME www → x.com. (TTL 300)",
    );
  });

  test("includes priority/weight/port for SRV", () => {
    const r = rec({
      name: "_sip._tcp",
      type: DnsRecordType.SRV,
      value: "s.com.",
      priority: 10,
      weight: 60,
      port: 5060,
    });
    expect(formatRecord(r)).toBe("SRV _sip._tcp → s.com. (TTL 300) [pri=10, w=60, port=5060]");
  });

  test("includes only priority for MX", () => {
    const r = rec({ type: DnsRecordType.MX, value: "10 m.com.", priority: 10 });
    expect(formatRecord(r)).toBe("MX (apex) → 10 m.com. (TTL 300) [pri=10]");
  });

  test("shows proxied flag", () => {
    const r = rec({ name: "www", type: DnsRecordType.A, value: "1.2.3.4", proxied: true });
    expect(formatRecord(r)).toBe("A www → 1.2.3.4 (TTL 300) [proxied]");
  });

  test("shows proxied and comment", () => {
    const r = rec({
      name: "api",
      type: DnsRecordType.AAAA,
      value: "100::",
      ttl: 1,
      proxied: true,
      comment: "Managed by Cloudflare Workers",
    });
    expect(formatRecord(r)).toBe(
      "AAAA api → 100:: (TTL 1) [proxied, Managed by Cloudflare Workers]",
    );
  });
});
