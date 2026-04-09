import { DiffAction } from "../enums.ts";
import type { DiffEntry, DnsRecord } from "../types.ts";
import { recordKey, recordsEqual } from "../util/dns.ts";

export function diffRecords(desired: DnsRecord[], existing: DnsRecord[]): DiffEntry[] {
  const entries: DiffEntry[] = [];

  const existingByKey = new Map<string, DnsRecord>();
  for (const r of existing) {
    existingByKey.set(recordKey(r), r);
  }

  const desiredByKey = new Map<string, DnsRecord>();
  for (const r of desired) {
    desiredByKey.set(recordKey(r), r);
  }

  // Records in desired
  for (const [key, d] of desiredByKey) {
    const e = existingByKey.get(key);
    if (!e) {
      entries.push({ action: DiffAction.Create, desired: d });
    } else if (recordsEqual(d, e)) {
      entries.push({ action: DiffAction.Noop, desired: d, existing: e });
    } else {
      entries.push({ action: DiffAction.Update, desired: d, existing: e });
    }
  }

  // Records only in existing (deletes)
  for (const [key, e] of existingByKey) {
    if (!desiredByKey.has(key)) {
      entries.push({ action: DiffAction.Delete, existing: e });
    }
  }

  return entries;
}

export function summarize(entries: DiffEntry[]) {
  let creates = 0;
  let updates = 0;
  let deletes = 0;
  let noops = 0;
  for (const e of entries) {
    switch (e.action) {
      case DiffAction.Create:
        creates++;
        break;
      case DiffAction.Update:
        updates++;
        break;
      case DiffAction.Delete:
        deletes++;
        break;
      case DiffAction.Noop:
        noops++;
        break;
    }
  }
  return { creates, updates, deletes, noops };
}
