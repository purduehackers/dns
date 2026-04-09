import { test, expect, describe } from "bun:test";
import { DiffAction, DnsRecordType } from "../enums.ts";
import { SafetyError } from "../errors.ts";
import { checkDeleteThreshold, filterDeletes } from "./safety.ts";
import type { ExecutionPlan } from "../types.ts";

const plan = (d: number, n: number): ExecutionPlan => ({
  zone: "test.com",
  provider: "cloudflare",
  entries: [],
  summary: { creates: 0, updates: 0, deletes: d, noops: n },
});

describe("checkDeleteThreshold", () => {
  test("passes under threshold", () => {
    expect(() => checkDeleteThreshold(plan(1, 10), 0.33)).not.toThrow();
  });

  test("throws over threshold", () => {
    expect(() => checkDeleteThreshold(plan(5, 5), 0.33)).toThrow(SafetyError);
  });

  test("passes with zero existing", () => {
    const p = {
      ...plan(0, 0),
      summary: { creates: 5, updates: 0, deletes: 0, noops: 0 },
    };
    expect(() => checkDeleteThreshold(p, 0.33)).not.toThrow();
  });

  test("passes with zero total", () => {
    expect(() => checkDeleteThreshold(plan(0, 0), 0.33)).not.toThrow();
  });
});

describe("filterDeletes", () => {
  test("strips delete entries and zeroes count", () => {
    const p: ExecutionPlan = {
      zone: "test.com",
      provider: "cloudflare",
      entries: [
        {
          action: DiffAction.Create,
          desired: { name: "a", type: DnsRecordType.A, value: "1.1.1.1", ttl: 300 },
        },
        {
          action: DiffAction.Delete,
          existing: { name: "b", type: DnsRecordType.A, value: "2.2.2.2", ttl: 300 },
        },
        {
          action: DiffAction.Noop,
          desired: { name: "c", type: DnsRecordType.A, value: "3.3.3.3", ttl: 300 },
          existing: { name: "c", type: DnsRecordType.A, value: "3.3.3.3", ttl: 300 },
        },
      ],
      summary: { creates: 1, updates: 0, deletes: 1, noops: 1 },
    };
    const filtered = filterDeletes(p);
    expect(filtered.entries).toHaveLength(2);
    expect(filtered.summary.deletes).toBe(0);
    expect(filtered.entries.every((e) => e.action !== DiffAction.Delete)).toBe(true);
  });
});
