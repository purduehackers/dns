import { DiffAction } from "../enums.ts";
import { loadConfig } from "../config.ts";
import { buildAllPlans } from "../engine/plan.ts";
import { formatRecord } from "../util/dns.ts";
import * as log from "../util/logger.ts";

export async function runPlan(zoneFilter?: string): Promise<boolean> {
  const config = await loadConfig();
  const plans = await buildAllPlans(config, zoneFilter); // no safety check — plan is read-only

  let hasChanges = false;

  for (const execPlan of plans) {
    log.bold(`\n${execPlan.zone} (${execPlan.provider}):`);

    for (const entry of execPlan.entries) {
      const record = entry.desired ?? entry.existing!;
      switch (entry.action) {
        case DiffAction.Create:
          log.create(formatRecord(record));
          break;
        case DiffAction.Update:
          log.update(`${formatRecord(entry.existing!)} → ${formatRecord(entry.desired!)}`);
          break;
        case DiffAction.Delete:
          log.del(formatRecord(record));
          break;
        case DiffAction.Noop:
          log.noop(formatRecord(record));
          break;
      }
    }

    const s = execPlan.summary;
    log.info(
      `Summary: ${s.creates} create, ${s.updates} update, ${s.deletes} delete, ${s.noops} unchanged`,
    );

    const existingCount = s.deletes + s.updates + s.noops;
    if (existingCount > 0 && s.deletes / existingCount > config.settings.delete_threshold) {
      log.warn(
        `${execPlan.zone}: ${s.deletes} deletes out of ${existingCount} existing records exceeds ${(config.settings.delete_threshold * 100).toFixed(0)}% threshold — apply will be blocked`,
      );
    }

    if (s.creates + s.updates + s.deletes > 0) {
      hasChanges = true;
    }
  }

  return hasChanges;
}
