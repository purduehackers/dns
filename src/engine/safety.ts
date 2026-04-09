import { DiffAction } from "../enums.ts";
import { SafetyError } from "../errors.ts";
import type { ExecutionPlan } from "../types.ts";

/**
 * Check if the number of deletes exceeds the threshold.
 * Threshold is a ratio (0-1) of deletes vs total existing records.
 */
export function checkDeleteThreshold(plan: ExecutionPlan, threshold: number): void {
  const total =
    plan.summary.creates + plan.summary.updates + plan.summary.deletes + plan.summary.noops;

  if (total === 0) return;

  const existingCount = plan.summary.deletes + plan.summary.updates + plan.summary.noops;
  if (existingCount === 0) return;

  const deleteRatio = plan.summary.deletes / existingCount;

  if (deleteRatio > threshold) {
    throw new SafetyError("Delete threshold exceeded", {
      zone: plan.zone,
      deletes: plan.summary.deletes,
      existingCount,
      deleteRatio: Number.parseFloat((deleteRatio * 100).toFixed(1)),
      threshold: Number.parseFloat((threshold * 100).toFixed(1)),
    });
  }
}

/** In lenient mode, filter out delete actions */
export function filterDeletes(plan: ExecutionPlan): ExecutionPlan {
  const entries = plan.entries.filter((e) => e.action !== DiffAction.Delete);
  return {
    ...plan,
    entries,
    summary: {
      ...plan.summary,
      deletes: 0,
    },
  };
}
