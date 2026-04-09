import sade from "sade";
import { runValidate } from "./cli/validate.ts";
import { runPlan } from "./cli/plan.ts";
import { runApply } from "./cli/apply.ts";
import { runPull } from "./cli/pull.ts";
import { DnsError } from "./errors.ts";
import * as log from "./util/logger.ts";

// biome-ignore lint: sade callback types are loose
function handle<T extends (...args: any[]) => Promise<void>>(fn: T): T {
  return ((...args: Parameters<T>) => {
    fn(...args).catch((e: Error) => {
      log.error(e.message);
      if (e instanceof DnsError && Object.keys(e.metadata).length > 0) {
        log.dim(JSON.stringify(e.metadata, null, 2));
      }
      process.exit(1);
    });
  }) as T;
}

const prog = sade("dns");

prog.version("0.1.0");

prog
  .command("validate")
  .describe("Parse and validate all zone files")
  .action(
    handle(async () => {
      process.exit(Number(!(await runValidate())));
    }),
  );

prog
  .command("plan")
  .describe("Dry-run: diff desired vs live DNS records")
  .option("--zone", "Only plan a specific zone")
  .action(
    handle(async (opts: { zone?: string }) => {
      await runPlan(opts.zone);
    }),
  );

prog
  .command("apply")
  .describe("Deploy DNS changes to providers")
  .option("--zone", "Only apply to a specific zone")
  .option("--yes", "Skip confirmation prompt", false)
  .action(
    handle(async (opts: { zone?: string; yes: boolean }) => {
      await runApply(opts.zone, opts.yes);
    }),
  );

prog
  .command("pull")
  .describe("Pull live DNS records into zone files")
  .option("--zone", "Only pull a specific zone")
  .option("--yes", "Skip confirmation prompt", false)
  .action(
    handle(async (opts: { zone?: string; yes: boolean }) => {
      await runPull(opts.zone, opts.yes);
    }),
  );

prog.parse(process.argv);
