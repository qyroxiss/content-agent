#!/usr/bin/env node
/**
 * run_daily.js — chains pull_data.js + telegram_reporter.js for the
 * scheduled Windows Task ("QuietlyStrangeContentAgent", daily 09:00).
 * Logs to logs/daily.log since it runs unattended with no visible console.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "daily.log");
fs.mkdirSync(LOG_DIR, { recursive: true });

function log(line) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  fs.appendFileSync(LOG_FILE, stamped);
  process.stdout.write(stamped);
}

function run(script) {
  log(`▶ running ${script}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], { encoding: "utf8" });
  if (result.stdout) log(result.stdout.trim());
  if (result.stderr) log(`stderr: ${result.stderr.trim()}`);
  if (result.status !== 0) {
    log(`✗ ${script} exited with code ${result.status}`);
    return false;
  }
  log(`✓ ${script} finished`);
  return true;
}

const pulled = run("pull_data.js");
if (!pulled) {
  log("✗ skipping Telegram report — data pull failed");
  process.exit(1);
}
run("telegram_reporter.js");
