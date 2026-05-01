#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const version = String(pkg.version ?? "").trim();
if (!version) {
  console.error("write-version: package.json is missing a version string");
  process.exit(1);
}

const target = resolve(root, "public", "version");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${version}\n`, "utf8");
console.log(`write-version: wrote ${target} (${version})`);
