import { test, expect, describe } from "bun:test";
import { DiffAction, DnsRecordType } from "../enums.ts";
import type { DnsRecord } from "../types.ts";
import { diffRecords, summarize } from "./diff.ts";

const r = (name: string, type: DnsRecordType, value: string, ttl = 300): DnsRecord => ({
  name,
  type,
  value,
  ttl,
});

describe("diffRecords", () => {
  test("create when only in desired", () => {
    const entries = diffRecords([r("www", DnsRecordType.A, "1.2.3.4")], []);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe(DiffAction.Create);
  });

  test("delete when only in existing", () => {
    const entries = diffRecords([], [r("old", DnsRecordType.A, "1.2.3.4")]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe(DiffAction.Delete);
  });

  test("noop when identical", () => {
    const entries = diffRecords(
      [r("www", DnsRecordType.A, "1.2.3.4")],
      [r("www", DnsRecordType.A, "1.2.3.4")],
    );
    expect(entries[0]!.action).toBe(DiffAction.Noop);
  });

  test("update when TTL differs", () => {
    const entries = diffRecords(
      [r("www", DnsRecordType.A, "1.2.3.4", 600)],
      [r("www", DnsRecordType.A, "1.2.3.4", 300)],
    );
    expect(entries[0]!.action).toBe(DiffAction.Update);
  });

  test("mixed create/update/delete/noop", () => {
    const s = summarize(
      diffRecords(
        [r("a", DnsRecordType.A, "1.1.1.1"), r("b", DnsRecordType.A, "2.2.2.2", 600)],
        [r("b", DnsRecordType.A, "2.2.2.2", 300), r("c", DnsRecordType.A, "3.3.3.3")],
      ),
    );
    expect(s).toEqual({ creates: 1, updates: 1, deletes: 1, noops: 0 });
  });
});

describe("summarize", () => {
  test("counts all action types including noop", () => {
    const s = summarize(
      diffRecords(
        [
          r("a", DnsRecordType.A, "1.1.1.1"),
          r("b", DnsRecordType.A, "2.2.2.2"),
          r("c", DnsRecordType.A, "3.3.3.3", 600),
        ],
        [
          r("b", DnsRecordType.A, "2.2.2.2"),
          r("c", DnsRecordType.A, "3.3.3.3", 300),
          r("d", DnsRecordType.A, "4.4.4.4"),
        ],
      ),
    );
    expect(s).toEqual({ creates: 1, updates: 1, deletes: 1, noops: 1 });
  });
});
