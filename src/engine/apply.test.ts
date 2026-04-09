import { test, expect, describe } from "bun:test";
import { DiffAction, DnsRecordType } from "../enums.ts";
import type { DnsProvider, ExecutionPlan } from "../types.ts";
import { applyPlan } from "./apply.ts";

function mockProvider(): DnsProvider & {
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    name: "mock",
    calls,
    async listRecords() {
      return [];
    },
    async createRecord(...args) {
      calls.push({ method: "createRecord", args });
    },
    async updateRecord(...args) {
      calls.push({ method: "updateRecord", args });
    },
    async deleteRecord(...args) {
      calls.push({ method: "deleteRecord", args });
    },
  };
}

const r = (name: string, value: string) => ({
  name,
  type: DnsRecordType.A,
  value,
  ttl: 300,
});

describe("applyPlan", () => {
  test("calls createRecord for create entries", async () => {
    const provider = mockProvider();
    const plan: ExecutionPlan = {
      zone: "test.com",
      provider: "mock",
      entries: [{ action: DiffAction.Create, desired: r("www", "1.2.3.4") }],
      summary: { creates: 1, updates: 0, deletes: 0, noops: 0 },
    };
    await applyPlan(plan, provider);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.method).toBe("createRecord");
  });

  test("calls updateRecord for update entries", async () => {
    const provider = mockProvider();
    const plan: ExecutionPlan = {
      zone: "test.com",
      provider: "mock",
      entries: [
        {
          action: DiffAction.Update,
          existing: r("www", "1.2.3.4"),
          desired: { ...r("www", "1.2.3.4"), ttl: 600 },
        },
      ],
      summary: { creates: 0, updates: 1, deletes: 0, noops: 0 },
    };
    await applyPlan(plan, provider);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.method).toBe("updateRecord");
  });

  test("calls deleteRecord for delete entries", async () => {
    const provider = mockProvider();
    const plan: ExecutionPlan = {
      zone: "test.com",
      provider: "mock",
      entries: [{ action: DiffAction.Delete, existing: r("old", "9.9.9.9") }],
      summary: { creates: 0, updates: 0, deletes: 1, noops: 0 },
    };
    await applyPlan(plan, provider);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.method).toBe("deleteRecord");
  });

  test("skips noop entries", async () => {
    const provider = mockProvider();
    const plan: ExecutionPlan = {
      zone: "test.com",
      provider: "mock",
      entries: [
        { action: DiffAction.Noop, desired: r("www", "1.2.3.4"), existing: r("www", "1.2.3.4") },
      ],
      summary: { creates: 0, updates: 0, deletes: 0, noops: 1 },
    };
    await applyPlan(plan, provider);
    expect(provider.calls).toHaveLength(0);
  });

  test("handles empty plan", async () => {
    const provider = mockProvider();
    const plan: ExecutionPlan = {
      zone: "test.com",
      provider: "mock",
      entries: [],
      summary: { creates: 0, updates: 0, deletes: 0, noops: 0 },
    };
    await applyPlan(plan, provider);
    expect(provider.calls).toHaveLength(0);
  });

  test("processes mixed actions in order", async () => {
    const provider = mockProvider();
    const plan: ExecutionPlan = {
      zone: "test.com",
      provider: "mock",
      entries: [
        { action: DiffAction.Create, desired: r("a", "1.1.1.1") },
        { action: DiffAction.Noop, desired: r("b", "2.2.2.2"), existing: r("b", "2.2.2.2") },
        { action: DiffAction.Delete, existing: r("c", "3.3.3.3") },
        {
          action: DiffAction.Update,
          existing: r("d", "4.4.4.4"),
          desired: { ...r("d", "4.4.4.4"), ttl: 600 },
        },
      ],
      summary: { creates: 1, updates: 1, deletes: 1, noops: 1 },
    };
    await applyPlan(plan, provider);
    expect(provider.calls).toHaveLength(3);
    expect(provider.calls[0]!.method).toBe("createRecord");
    expect(provider.calls[1]!.method).toBe("deleteRecord");
    expect(provider.calls[2]!.method).toBe("updateRecord");
  });
});
