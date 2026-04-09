import { test, expect, describe } from "bun:test";
import { DnsRecordType } from "../enums.ts";
import { rec, zone, validZoneDir, invalidZoneDir } from "../util/fixtures.ts";
import { parseZoneDir } from "./parser.ts";
import { validateZone } from "./validator.ts";

describe("validateZone: fixtures", () => {
  test("valid fixture passes", async () => {
    const z = await parseZoneDir(validZoneDir());
    expect(validateZone(z)).toHaveLength(0);
  });

  test("invalid fixture has errors", async () => {
    const z = await parseZoneDir(invalidZoneDir());
    expect(validateZone(z).length).toBeGreaterThan(0);
  });
});

describe("validateZone: A records", () => {
  test("accepts valid IPv4", () => {
    expect(validateZone(zone(rec({ type: DnsRecordType.A, value: "192.168.1.1" })))).toHaveLength(
      0,
    );
  });

  test("rejects invalid IPv4", () => {
    const errors = validateZone(zone(rec({ type: DnsRecordType.A, value: "999.1.2.3" })));
    expect(errors[0]!.message).toContain("IPv4");
  });

  test("rejects IPv4 octet out of range", () => {
    const errors = validateZone(zone(rec({ type: DnsRecordType.A, value: "1.2.3.256" })));
    expect(errors[0]!.message).toContain("octet out of range");
  });
});

describe("validateZone: AAAA records", () => {
  test("accepts valid IPv6", () => {
    expect(
      validateZone(zone(rec({ type: DnsRecordType.AAAA, value: "2001:db8::1" }))),
    ).toHaveLength(0);
  });

  test("rejects invalid IPv6", () => {
    const errors = validateZone(zone(rec({ type: DnsRecordType.AAAA, value: "not-ipv6!" })));
    expect(errors[0]!.message).toContain("IPv6");
  });
});

describe("validateZone: CNAME records", () => {
  test("rejects CNAME at apex", () => {
    const errors = validateZone(zone(rec({ type: DnsRecordType.CNAME, value: "x.com." })));
    expect(errors.some((e) => e.message.includes("apex"))).toBe(true);
  });

  test("rejects invalid CNAME target", () => {
    const errors = validateZone(
      zone(rec({ name: "www", type: DnsRecordType.CNAME, value: "bad value!" })),
    );
    expect(errors.some((e) => e.message.includes("FQDN"))).toBe(true);
  });

  test("accepts valid CNAME", () => {
    expect(
      validateZone(
        zone(
          rec({
            name: "www",
            type: DnsRecordType.CNAME,
            value: "example.com.",
          }),
        ),
      ),
    ).toHaveLength(0);
  });

  test("rejects CNAME coexisting with other types", () => {
    const errors = validateZone(
      zone(
        rec({ name: "x", type: DnsRecordType.CNAME, value: "a.com." }),
        rec({ name: "x", type: DnsRecordType.A, value: "1.2.3.4" }),
      ),
    );
    expect(errors.some((e) => e.message.includes("conflicts"))).toBe(true);
  });
});

describe("validateZone: MX records", () => {
  test("accepts valid MX with priority in value", () => {
    expect(
      validateZone(zone(rec({ type: DnsRecordType.MX, value: "10 mail.example.com." }))),
    ).toHaveLength(0);
  });

  test("accepts valid MX with bare FQDN", () => {
    expect(
      validateZone(zone(rec({ type: DnsRecordType.MX, value: "mail.example.com." }))),
    ).toHaveLength(0);
  });

  test("rejects MX with invalid priority", () => {
    const errors = validateZone(
      zone(rec({ type: DnsRecordType.MX, value: "abc mail.example.com." })),
    );
    expect(errors[0]!.message).toContain("priority");
  });

  test("rejects MX with too many parts", () => {
    const errors = validateZone(
      zone(rec({ type: DnsRecordType.MX, value: "10 mail.example.com. extra" })),
    );
    expect(errors[0]!.message).toContain("MX value");
  });
});

describe("validateZone: TXT records", () => {
  test("accepts any TXT value", () => {
    expect(
      validateZone(zone(rec({ type: DnsRecordType.TXT, value: "anything goes here" }))),
    ).toHaveLength(0);
  });
});

describe("validateZone: NS records", () => {
  test("accepts valid NS", () => {
    expect(
      validateZone(
        zone(
          rec({
            name: "sub",
            type: DnsRecordType.NS,
            value: "ns1.example.com.",
          }),
        ),
      ),
    ).toHaveLength(0);
  });

  test("rejects invalid NS target", () => {
    const errors = validateZone(
      zone(rec({ name: "sub", type: DnsRecordType.NS, value: "bad value!" })),
    );
    expect(errors[0]!.message).toContain("FQDN");
  });
});

describe("validateZone: SRV records", () => {
  test("rejects SRV missing required fields", () => {
    const errors = validateZone(
      zone(rec({ name: "_sip._tcp", type: DnsRecordType.SRV, value: "s.com." })),
    );
    expect(errors.some((e) => e.message.includes("priority"))).toBe(true);
  });

  test("rejects SRV missing weight", () => {
    const errors = validateZone(
      zone(
        rec({
          name: "_sip._tcp",
          type: DnsRecordType.SRV,
          value: "s.com.",
          priority: 10,
        }),
      ),
    );
    expect(errors.some((e) => e.message.includes("weight"))).toBe(true);
  });

  test("rejects SRV missing port", () => {
    const errors = validateZone(
      zone(
        rec({
          name: "_sip._tcp",
          type: DnsRecordType.SRV,
          value: "s.com.",
          priority: 10,
          weight: 60,
        }),
      ),
    );
    expect(errors.some((e) => e.message.includes("port"))).toBe(true);
  });

  test("accepts valid SRV", () => {
    expect(
      validateZone(
        zone(
          rec({
            name: "_sip._tcp",
            type: DnsRecordType.SRV,
            value: "s.com.",
            priority: 10,
            weight: 60,
            port: 5060,
          }),
        ),
      ),
    ).toHaveLength(0);
  });
});

describe("validateZone: CAA records", () => {
  test("accepts valid CAA", () => {
    expect(
      validateZone(zone(rec({ type: DnsRecordType.CAA, value: '0 issue "letsencrypt.org"' }))),
    ).toHaveLength(0);
  });

  test("rejects CAA with too few parts", () => {
    const errors = validateZone(zone(rec({ type: DnsRecordType.CAA, value: "0 issue" })));
    expect(errors[0]!.message).toContain("CAA value");
  });

  test("rejects CAA with invalid flags", () => {
    const errors = validateZone(
      zone(rec({ type: DnsRecordType.CAA, value: '999 issue "letsencrypt.org"' })),
    );
    expect(errors[0]!.message).toContain("CAA flags");
  });
});

describe("validateZone: PTR records", () => {
  test("accepts valid PTR", () => {
    expect(
      validateZone(
        zone(
          rec({
            name: "1.168.192",
            type: DnsRecordType.PTR,
            value: "host.example.com.",
          }),
        ),
      ),
    ).toHaveLength(0);
  });

  test("rejects invalid PTR target", () => {
    const errors = validateZone(
      zone(rec({ name: "1.168.192", type: DnsRecordType.PTR, value: "bad value!" })),
    );
    expect(errors[0]!.message).toContain("FQDN");
  });
});

describe("validateZone: general", () => {
  test("rejects invalid record name", () => {
    const errors = validateZone(
      zone(rec({ name: "bad name!", type: DnsRecordType.A, value: "1.2.3.4" })),
    );
    expect(errors[0]!.message).toContain("Invalid record name");
  });

  test("rejects zero TTL", () => {
    const errors = validateZone(zone(rec({ type: DnsRecordType.A, value: "1.2.3.4", ttl: 0 })));
    expect(errors.some((e) => e.message.includes("TTL must be positive"))).toBe(true);
  });
});
