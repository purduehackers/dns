import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { DnsRecordType } from "../enums.ts";
import { ProviderError } from "../errors.ts";
import { CloudflareProvider } from "./cloudflare.ts";

let origToken: string | undefined;

function cfResponse<T>(result: T, resultInfo?: object) {
  return Response.json({
    success: true,
    errors: [],
    result,
    result_info: resultInfo,
  });
}

function cfError(message: string) {
  return Response.json({
    success: false,
    errors: [{ message }],
    result: null,
  });
}

const ZONE_ID = "zone-id-123";
const ZONE_NAME = "example.com";

function zoneResponse() {
  return cfResponse([{ id: ZONE_ID }]);
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = mock(handler);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  origToken = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
});

afterEach(() => {
  if (origToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
  else process.env.CLOUDFLARE_API_TOKEN = origToken;
  mock.restore();
});

describe("CloudflareProvider: constructor", () => {
  test("throws when no token set", () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    expect(() => new CloudflareProvider()).toThrow(ProviderError);
  });

  test("accepts explicit token", () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    const provider = new CloudflareProvider("explicit-token");
    expect(provider.name).toBe("cloudflare");
  });
});

const MIXED_RECORDS = [
  { id: "r1", type: "A", name: "example.com", content: "1.2.3.4", ttl: 1 },
  { id: "r2", type: "CNAME", name: "www.example.com", content: "example.com", ttl: 600 },
  {
    id: "r3",
    type: "MX",
    name: "example.com",
    content: "mail.example.com",
    ttl: 300,
    priority: 10,
  },
  { id: "r4", type: "TXT", name: "example.com", content: '"v=spf1 ~all"', ttl: 300 },
];

describe("CloudflareProvider: listRecords", () => {
  test("fetches and converts records", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(MIXED_RECORDS, { page: 1, per_page: 100, total_count: 4, total_pages: 1 }),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records).toHaveLength(4);
    expect(records[0]).toEqual({
      name: "@",
      type: DnsRecordType.A,
      value: "1.2.3.4",
      ttl: 1,
    });
    expect(records[1]!.name).toBe("www");
    expect(records[1]!.value).toBe("example.com");
    expect(records[2]!.value).toBe("mail.example.com");
    expect(records[2]!.priority).toBe(10);
    expect(records[3]!.value).toBe('"v=spf1 ~all"');
  });

  test("paginates", async () => {
    const provider = new CloudflareProvider("tok");
    let callCount = 0;
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(
            cfResponse(
              [{ id: "r1", type: "A", name: "example.com", content: "1.1.1.1", ttl: 300 }],
              { page: 1, per_page: 100, total_count: 2, total_pages: 2 },
            ),
          );
        }
        return Promise.resolve(
          cfResponse([{ id: "r2", type: "A", name: "example.com", content: "2.2.2.2", ttl: 300 }], {
            page: 2,
            per_page: 100,
            total_count: 2,
            total_pages: 2,
          }),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records).toHaveLength(2);
    expect(callCount).toBe(2);
  });

  test("throws on API error", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      return Promise.resolve(cfError("rate limited"));
    });

    expect(provider.listRecords(ZONE_NAME)).rejects.toThrow("Cloudflare API error");
  });
});

describe("CloudflareProvider: mutations", () => {
  test("createRecord sends POST", async () => {
    const provider = new CloudflareProvider("tok");
    const calls: { url: string; method: string; body: string }[] = [];
    mockFetch((url, init) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      calls.push({ url, method: init?.method ?? "GET", body: (init?.body as string) ?? "" });
      return Promise.resolve(cfResponse({ id: "new" }));
    });

    await provider.createRecord(ZONE_NAME, {
      name: "www",
      type: DnsRecordType.CNAME,
      value: "example.com.",
      ttl: 300,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    const body = JSON.parse(calls[0]!.body);
    expect(body.name).toBe("www.example.com");
    expect(body.type).toBe("CNAME");
  });

  test("deleteRecord sends DELETE", async () => {
    const provider = new CloudflareProvider("tok");
    const calls: { url: string; method: string }[] = [];
    mockFetch((url, init) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("dns_records?type=")) {
        return Promise.resolve(
          cfResponse([
            { id: "rec-123", type: "A", name: "example.com", content: "1.2.3.4", ttl: 300 },
          ]),
        );
      }
      calls.push({ url, method: init?.method ?? "GET" });
      return Promise.resolve(cfResponse({ id: "rec-123" }));
    });

    await provider.deleteRecord(ZONE_NAME, {
      name: "@",
      type: DnsRecordType.A,
      value: "1.2.3.4",
      ttl: 300,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("DELETE");
  });

  test("updateRecord sends PUT", async () => {
    const provider = new CloudflareProvider("tok");
    const calls: { url: string; method: string }[] = [];
    mockFetch((url, init) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("dns_records?type=")) {
        return Promise.resolve(
          cfResponse([
            { id: "rec-456", type: "A", name: "www.example.com", content: "1.2.3.4", ttl: 300 },
          ]),
        );
      }
      calls.push({ url, method: init?.method ?? "GET" });
      return Promise.resolve(cfResponse({ id: "rec-456" }));
    });

    await provider.updateRecord(
      ZONE_NAME,
      { name: "www", type: DnsRecordType.A, value: "1.2.3.4", ttl: 300 },
      { name: "www", type: DnsRecordType.A, value: "1.2.3.4", ttl: 600 },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.url).toContain("rec-456");
  });

  test("throws when record not found for findRecordId", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("dns_records?type=")) return Promise.resolve(cfResponse([]));
      return Promise.resolve(cfResponse([]));
    });

    expect(
      provider.deleteRecord(ZONE_NAME, {
        name: "@",
        type: DnsRecordType.A,
        value: "9.9.9.9",
        ttl: 300,
      }),
    ).rejects.toThrow("Could not find Cloudflare record");
  });
});

describe("CloudflareProvider: zone lookup", () => {
  test("getZoneId caches zone ID", async () => {
    const provider = new CloudflareProvider("tok");
    let zoneLookups = 0;
    mockFetch((url) => {
      if (url.includes("/zones?name=")) {
        zoneLookups++;
        return Promise.resolve(zoneResponse());
      }
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse([], { page: 1, per_page: 100, total_count: 0, total_pages: 1 }),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    await provider.listRecords(ZONE_NAME);
    await provider.listRecords(ZONE_NAME);
    expect(zoneLookups).toBe(1);
  });

  test("throws when zone not found", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch(() => Promise.resolve(cfResponse([])));

    expect(provider.listRecords("nope.com")).rejects.toThrow("Zone not found");
  });
});

describe("CloudflareProvider: SRV records", () => {
  test("recordToCf includes SRV data block", async () => {
    const provider = new CloudflareProvider("tok");
    const bodies: Record<string, unknown>[] = [];
    mockFetch((url, init) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (init?.body) bodies.push(JSON.parse(init.body as string));
      return Promise.resolve(cfResponse({ id: "new" }));
    });

    await provider.createRecord(ZONE_NAME, {
      name: "_sip._tcp",
      type: DnsRecordType.SRV,
      value: "sip.example.com.",
      ttl: 300,
      priority: 10,
      weight: 60,
      port: 5060,
    });

    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    expect(body.priority).toBe(10);
    expect((body.data as Record<string, unknown>).weight).toBe(60);
    expect((body.data as Record<string, unknown>).port).toBe(5060);
  });

  test("cfToRecord handles SRV weight/port from data", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "SRV",
                name: "_sip._tcp.example.com",
                content: "sip.example.com.",
                ttl: 300,
                priority: 10,
                data: { weight: 60, port: 5060, target: "sip.example.com." },
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.weight).toBe(60);
    expect(records[0]!.port).toBe(5060);
    expect(records[0]!.priority).toBe(10);
  });
});

describe("CloudflareProvider: proxied and managed records", () => {
  test("preserves proxied flag from CF", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "A",
                name: "example.com",
                content: "1.2.3.4",
                ttl: 1,
                proxied: true,
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.proxied).toBe(true);
  });

  test("omits proxied when false", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "A",
                name: "example.com",
                content: "1.2.3.4",
                ttl: 300,
                proxied: false,
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.proxied).toBeUndefined();
  });
});

describe("CloudflareProvider: managed record detection", () => {
  test("annotates Workers by origin_worker_id", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "AAAA",
                name: "api.example.com",
                content: "100::",
                ttl: 1,
                proxied: true,
                meta: { origin_worker_id: "abc123", read_only: true },
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.comment).toBe("Managed by Cloudflare Workers");
  });

  test("annotates R2 by r2_bucket", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "CNAME",
                name: "assets.example.com",
                content: "public.r2.dev",
                ttl: 1,
                proxied: true,
                meta: { r2_bucket: "my-bucket", read_only: true },
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.comment).toBe("Managed by Cloudflare R2");
  });

  test("annotates Pages by read_only + pages.dev content", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "CNAME",
                name: "blog.example.com",
                content: "my-site.pages.dev",
                ttl: 1,
                proxied: true,
                meta: { read_only: true },
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.comment).toBe("Managed by Cloudflare Pages");
  });
});

describe("CloudflareProvider: managed record edge cases", () => {
  test("annotates Tunnel by managed_by_argo_tunnel", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "CNAME",
                name: "app.example.com",
                content: "abc-123.cfargotunnel.com",
                ttl: 1,
                proxied: true,
                meta: { managed_by_argo_tunnel: true },
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.comment).toBe("Managed by Cloudflare Tunnel");
  });

  test("annotates Email Routing", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "MX",
                name: "example.com",
                content: "route1.mx.cloudflare.net",
                ttl: 1,
                priority: 36,
                meta: { email_routing: true, read_only: true },
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.comment).toBe("Managed by Cloudflare Email Routing");
  });

  test("no comment for normal proxied record", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "A",
                name: "www.example.com",
                content: "1.2.3.4",
                ttl: 300,
                proxied: true,
                meta: {},
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.proxied).toBe(true);
    expect(records[0]!.comment).toBeUndefined();
  });
});

describe("CloudflareProvider: managed record comments", () => {
  test("preserves CF comment over auto-generated one", async () => {
    const provider = new CloudflareProvider("tok");
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (url.includes("/dns_records?page=")) {
        return Promise.resolve(
          cfResponse(
            [
              {
                id: "r1",
                type: "A",
                name: "example.com",
                content: "1.2.3.4",
                ttl: 300,
                proxied: true,
                comment: "Production server",
                meta: { origin_worker_id: "abc", read_only: true },
              },
            ],
            { page: 1, per_page: 100, total_count: 1, total_pages: 1 },
          ),
        );
      }
      return Promise.resolve(cfResponse([]));
    });

    const records = await provider.listRecords(ZONE_NAME);
    expect(records[0]!.comment).toBe("Production server");
  });

  test("sends proxied in create body", async () => {
    const provider = new CloudflareProvider("tok");
    const bodies: Record<string, unknown>[] = [];
    mockFetch((url, init) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (init?.body) bodies.push(JSON.parse(init.body as string));
      return Promise.resolve(cfResponse({ id: "new" }));
    });

    await provider.createRecord(ZONE_NAME, {
      name: "www",
      type: DnsRecordType.CNAME,
      value: "example.com.",
      ttl: 300,
      proxied: true,
    });

    expect(bodies[0]!.proxied).toBe(true);
  });

  test("sends proxied=false when not set", async () => {
    const provider = new CloudflareProvider("tok");
    const bodies: Record<string, unknown>[] = [];
    mockFetch((url, init) => {
      if (url.includes("/zones?name=")) return Promise.resolve(zoneResponse());
      if (init?.body) bodies.push(JSON.parse(init.body as string));
      return Promise.resolve(cfResponse({ id: "new" }));
    });

    await provider.createRecord(ZONE_NAME, {
      name: "www",
      type: DnsRecordType.CNAME,
      value: "example.com.",
      ttl: 300,
    });

    expect(bodies[0]!.proxied).toBe(false);
  });
});
