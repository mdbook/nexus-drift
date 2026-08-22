import { writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runHeadless, type SimRunOpts } from "@/sim/runHeadless";

const USAGE = `Usage: npm run sim -- --seed <n> --ticks <n> [options]

Options:
  --seed <n>        Required. RNG seed (integer) — determinism.
  --ticks <n>       Required. Number of ticks to advance.
  --snapshot <csv>  Comma-separated tick indices to capture (e.g. 50,100,200).
  --every <n>       Also capture a snapshot every N ticks.
  --state           Include the full GameState in each snapshot (heavy; default is derived-only).
  --trace           Capture autobuy + worker-target decision traces into result.traces.
  --out <path>      Write JSON to this file instead of stdout.`;

export interface ParsedSimArgs {
  opts: SimRunOpts;
  out?: string;
}

function requireInt(value: string | undefined, name: string): number {
  if (value === undefined) throw new Error(`missing required --${name}`);
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`--${name} must be an integer, got "${value}"`);
  return n;
}

/** Parse harness CLI args into `runHeadless` opts. Pure + throwing, so it is unit-testable. */
export function parseSimArgs(argv: string[]): ParsedSimArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: "string" },
      ticks: { type: "string" },
      snapshot: { type: "string" },
      every: { type: "string" },
      state: { type: "boolean" },
      trace: { type: "boolean" },
      out: { type: "string" },
    },
  });

  const opts: SimRunOpts = {
    seed: requireInt(values.seed, "seed"),
    ticks: requireInt(values.ticks, "ticks"),
  };
  if (values.snapshot !== undefined) {
    opts.snapshotAt = values.snapshot
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => requireInt(part, "snapshot"));
  }
  if (values.every !== undefined) opts.snapshotEvery = requireInt(values.every, "every");
  if (values.state) opts.include = ["derived", "state"];
  if (values.trace) opts.trace = true;

  return { opts, out: values.out };
}

function main(): void {
  let parsed: ParsedSimArgs;
  try {
    parsed = parseSimArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n\n${USAGE}\n`);
    process.exit(1);
    return;
  }
  const json = JSON.stringify(runHeadless(parsed.opts));
  if (parsed.out) {
    writeFileSync(parsed.out, json);
    process.stderr.write(`Wrote ${parsed.out}\n`);
  } else {
    process.stdout.write(`${json}\n`);
  }
}

// ponytail: ESM entrypoint guard — run main() only when invoked directly, not when imported by tests.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
