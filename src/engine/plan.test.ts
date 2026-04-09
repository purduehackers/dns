import { test, expect, describe, mock } from "bun:test";
import { DnsRecordType } from "../enums.ts";
import type { Config, DnsProvider, DnsRecord } from "../types.ts";
import { buildPlan, buildAllPlans } from "./plan.ts";

function testConfig(overrides: Partial<Config["settings"]> = {}): Config {
  return {
    settings: {
      zones_dir: "fixtures",
      delete_threshold: 0.33,
      lenient: false,
      ...overrides,
    },
    providers: {
      cloudflare: { type: "cloudflare" },
    },
  };
}

function mockProvider(records: DnsRecord[] = []): DnsProvider {
  return {
    name: "cloudflare",
    async listRecords() {
      return records;
    },
    async createRecord() {},
    async updateRecord() {},
    async deleteRecord() {},
  };
}

describe("buildPlan", () => {
  test("builds plan for valid zone", async () => {
    const provider = mockProvider();
    const plan = await buildPlan(testConfig(), "valid-zone", provider);
    expect(plan.zone).toBe("valid-zone");
    expect(plan.provider).toBe("cloudflare");
    expect(plan.summary.creates).toBeGreaterThan(0);
  });

  test("throws on invalid zone", async () => {
    const config = testConfig({ zones_dir: "fixtures" });
    const provider = mockProvider();
    expect(buildPlan(config, "invalid-zone", provider)).rejects.toThrow("Zone validation failed");
  });

  test("detects noops when existing matches desired", async () => {
    const existing: DnsRecord[] = [
      { name: "@", type: DnsRecordType.A, value: "1.2.3.4", ttl: 300 },
      { name: "@", type: DnsRecordType.MX, value: "mail.example.com.", ttl: 300, priority: 10 },
      { name: "@", type: DnsRecordType.TXT, value: "v=spf1 ~all", ttl: 300 },
      { name: "www", type: DnsRecordType.CNAME, value: "example.com.", ttl: 300 },
      { name: "mail", type: DnsRecordType.A, value: "5.6.7.8", ttl: 3600 },
    ];
    const provider = mockProvider(existing);
    const plan = await buildPlan(testConfig(), "valid-zone", provider);
    expect(plan.summary.noops).toBe(5);
    expect(plan.summary.creates).toBe(0);
    expect(plan.summary.deletes).toBe(0);
  });

  test("filters deletes in lenient mode", async () => {
    const existing: DnsRecord[] = [
      { name: "@", type: DnsRecordType.A, value: "1.2.3.4", ttl: 300 },
      { name: "@", type: DnsRecordType.MX, value: "mail.example.com.", ttl: 300, priority: 10 },
      { name: "@", type: DnsRecordType.TXT, value: "v=spf1 ~all", ttl: 300 },
      { name: "www", type: DnsRecordType.CNAME, value: "example.com.", ttl: 300 },
      { name: "mail", type: DnsRecordType.A, value: "5.6.7.8", ttl: 3600 },
      { name: "extra", type: DnsRecordType.A, value: "9.9.9.9", ttl: 300 },
    ];
    const provider = mockProvider(existing);
    const plan = await buildPlan(testConfig({ lenient: true }), "valid-zone", provider);
    expect(plan.summary.deletes).toBe(0);
  });
});

describe("buildAllPlans", () => {
  test("discovers and builds plans for all zones", async () => {
    // This needs real zone dirs and a provider that doesn't error
    // We need CLOUDFLARE_API_TOKEN for createProvider, so mock at a higher level
    const origToken = process.env.CLOUDFLARE_API_TOKEN;
    process.env.CLOUDFLARE_API_TOKEN = "test-token";

    // Mock fetch so CloudflareProvider doesn't make real API calls
    const fetchMock = mock((url: string) => {
      if (url.includes("/zones?name=")) {
        return Promise.resolve(
          Response.json({ success: true, errors: [], result: [{ id: "zone-id" }] }),
        );
      }
      // dns_records listing — return empty
      return Promise.resolve(
        Response.json({
          success: true,
          errors: [],
          result: [],
          result_info: { page: 1, per_page: 100, total_count: 0, total_pages: 1 },
        }),
      );
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const config = testConfig({ zones_dir: "zones" });
      const plans = await buildAllPlans(config);
      expect(plans.length).toBeGreaterThan(0);
      expect(plans.every((p) => p.provider === "cloudflare")).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
      if (origToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = origToken;
      mock.restore();
    }
  });

  test("throws when no zones found", async () => {
    const config = testConfig({ zones_dir: "fixtures/empty-dir" });
    // Create empty dir
    const { mkdirSync, rmdirSync } = await import("node:fs");
    try {
      mkdirSync("fixtures/empty-dir", { recursive: true });
    } catch {}
    try {
      expect(buildAllPlans(config)).rejects.toThrow("No zones found");
    } finally {
      try {
        rmdirSync("fixtures/empty-dir");
      } catch {}
    }
  });

  test("throws when zone filter matches nothing", async () => {
    const config = testConfig({ zones_dir: "zones" });
    expect(buildAllPlans(config, "nonexistent.com")).rejects.toThrow("No zones found");
  });

  test("throws when provider not in config", async () => {
    const config: Config = {
      settings: { zones_dir: "zones", delete_threshold: 0.33, lenient: false },
      providers: {}, // no providers configured
    };
    expect(buildAllPlans(config, "purduehackers.com")).rejects.toThrow("Provider not found");
  });
});
