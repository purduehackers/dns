import { ConfigError } from "../errors.ts";
import { loadConfig } from "../config.ts";
import { buildAllPlans } from "../engine/plan.ts";
import { applyPlan } from "../engine/apply.ts";
import { createProvider } from "../provider/registry.ts";
import { formatRecord } from "../util/dns.ts";
import * as log from "../util/logger.ts";
import { DiffAction } from "../enums.ts";

export async function runApply(zoneFilter?: string, autoConfirm = false): Promise<void> {
  const config = await loadConfig();
  const plans = await buildAllPlans(config, zoneFilter, { checkSafety: true });

  const hasChanges = plans.some(
    (p) => p.summary.creates + p.summary.updates + p.summary.deletes > 0,
  );

  if (!hasChanges) {
    log.success("All zones are up to date. Nothing to apply.");
    return;
  }

  // Show plan summary
  for (const execPlan of plans) {
    const s = execPlan.summary;
    if (s.creates + s.updates + s.deletes === 0) continue;

    log.bold(`\n${execPlan.zone}:`);
    for (const entry of execPlan.entries) {
      if (entry.action === DiffAction.Noop) continue;
      const record = entry.desired ?? entry.existing!;
      switch (entry.action) {
        case DiffAction.Create:
          log.create(formatRecord(record));
          break;
        case DiffAction.Update:
          log.update(formatRecord(entry.desired!));
          break;
        case DiffAction.Delete:
          log.del(formatRecord(record));
          break;
      }
    }
    log.info(`${s.creates} create, ${s.updates} update, ${s.deletes} delete`);
  }

  if (!autoConfirm) {
    process.stdout.write("\nProceed? [y/N] ");
    const response = await new Promise<string>((resolve) => {
      process.stdin.once("data", (data) => resolve(data.toString().trim()));
    });
    process.stdin.unref();
    if (response.toLowerCase() !== "y") {
      log.warn("Aborted.");
      return;
    }
  }

  for (const execPlan of plans) {
    if (execPlan.summary.creates + execPlan.summary.updates + execPlan.summary.deletes === 0) {
      continue;
    }

    const providerConfig = config.providers[execPlan.provider];
    if (!providerConfig) {
      throw new ConfigError("Provider not found in config", {
        provider: execPlan.provider,
      });
    }
    const provider = createProvider(execPlan.provider, providerConfig);
    await applyPlan(execPlan, provider);
  }

  log.success("\nDone.");
}
