import { DiffAction } from "../enums.ts";
import type { DnsProvider, ExecutionPlan } from "../types.ts";
import { formatRecord } from "../util/dns.ts";
import * as log from "../util/logger.ts";

export async function applyPlan(plan: ExecutionPlan, provider: DnsProvider): Promise<void> {
  const actionEntries = plan.entries.filter((e) => e.action !== DiffAction.Noop);

  if (actionEntries.length === 0) {
    log.success(`${plan.zone}: No changes to apply.`);
    return;
  }

  log.bold(`Applying ${actionEntries.length} changes to ${plan.zone}...`);

  let applied = 0;
  let failed = 0;

  for (const entry of actionEntries) {
    const record = entry.desired ?? entry.existing!;
    try {
      switch (entry.action) {
        case DiffAction.Create:
          log.create(formatRecord(record));
          await provider.createRecord(plan.zone, record);
          break;
        case DiffAction.Update:
          log.update(formatRecord(entry.desired!));
          await provider.updateRecord(plan.zone, entry.existing!, entry.desired!);
          break;
        case DiffAction.Delete:
          log.del(formatRecord(record));
          await provider.deleteRecord(plan.zone, record);
          break;
      }
      applied++;
    } catch (e) {
      failed++;
      log.warn(`Failed to ${entry.action} ${formatRecord(record)}: ${(e as Error).message}`);
    }
  }

  if (failed > 0) {
    log.warn(`${plan.zone}: ${applied} applied, ${failed} failed.`);
  } else {
    log.success(`${plan.zone}: Applied ${applied} changes.`);
  }
}
