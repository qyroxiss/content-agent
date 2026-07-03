#!/usr/bin/env node
/**
 * telegram_reporter.js — sends a daily digest of the 5-agent dashboard
 * (dashboard/data.json) to Telegram.
 *
 * Usage:
 *   node scripts/telegram_reporter.js            # sends the report
 *   node scripts/telegram_reporter.js --dry-run  # prints the message, no send
 *
 * Zero dependencies. Node 18+ (built-in fetch).
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT, "dashboard", "data.json");

const THEME_WORDS = new Set([
  "the", "and", "for", "are", "but", "with", "that", "this", "you",
  "your", "our", "have", "from", "will", "can", "not", "was", "were",
  "about",
]);

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

function keywordsFromCaption(caption) {
  return (caption || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 4 && !THEME_WORDS.has(w))
    .slice(0, 3);
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function topIdea(data) {
  const pool = [];
  for (const c of data.competitors) {
    for (const p of c.recentPosts) {
      if (p.likes == null) continue;
      pool.push({ ...p, handle: c.handle, score: p.likes + (p.comments || 0) });
    }
  }
  pool.sort((a, b) => b.score - a.score);
  for (const p of pool) {
    const words = keywordsFromCaption(p.caption);
    if (!words.length) continue;
    return { title: titleCase(words.join(" ")), handle: p.handle, likes: p.likes, comments: p.comments || 0 };
  }
  return null;
}

function bestWorstOwnPosts(data) {
  const posts = data.own.posts.filter(p => p.likes != null);
  if (!posts.length) return { best: null, worst: null };
  const sorted = [...posts].sort((a, b) => (b.likes + (b.comments || 0)) - (a.likes + (a.comments || 0)));
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

function escapeMd(s) {
  return String(s).replace(/([_*`\[])/g, "\\$1");
}

function buildReport(data) {
  const idea = topIdea(data);
  const { best, worst } = bestWorstOwnPosts(data);
  const missing = data.competitors.filter(c => !c.followers && !c.recentPosts.length);
  const withData = data.competitors.filter(c => c.engagementRate != null);
  const avgCompetitor = withData.length
    ? withData.reduce((s, c) => s + c.engagementRate, 0) / withData.length
    : null;

  const lines = [];
  lines.push(`*Quietly Strange — Daily Content Report*`);
  lines.push(`_${new Date(data.generatedAt).toDateString()}_`);
  lines.push("");
  lines.push(`*Own* — @${escapeMd(data.own.handle)}: ${data.own.followers ?? "—"} followers, ${data.own.engagementRate ?? "—"}% engagement`);
  lines.push(`*Competitors* — ${avgCompetitor != null ? avgCompetitor.toFixed(2) + "%" : "—"} avg engagement (${withData.length}/${data.competitors.length} with data)`);
  if (missing.length) {
    lines.push(`⚠ no data: ${missing.map(c => "@" + c.handle).join(", ")}`);
  }
  lines.push("");
  lines.push(`*Ideator*`);
  lines.push(idea
    ? `${escapeMd(idea.title)} — inspired by @${escapeMd(idea.handle)}'s post (${idea.likes} likes, ${idea.comments} comments)`
    : "Not enough competitor data yet.");
  lines.push("");
  lines.push(`*Analyst*`);
  lines.push(best ? `Best post: ${best.likes} likes, ${best.comments || 0} comments — ${escapeMd((best.caption || "").slice(0, 80))}...` : "Not enough own posts yet.");
  lines.push(worst ? `Lowest post: ${worst.likes} likes, ${worst.comments || 0} comments — ${escapeMd((worst.caption || "").slice(0, 80))}...` : "");
  lines.push("");
  lines.push(`*DM Manager*`);
  lines.push("No inbox connected yet — draft replies are templates only.");

  return lines.filter(l => l !== "").join("\n");
}

async function sendTelegram(token, chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`Telegram send failed: ${JSON.stringify(body)}`);
  return body;
}

(async () => {
  if (!fs.existsSync(DATA_FILE)) {
    console.error("✗ dashboard/data.json not found — run scripts/pull_data.js first.");
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const report = buildReport(data);
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log(report);
    return;
  }

  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("✗ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing in .env");
    process.exit(1);
  }

  try {
    await sendTelegram(token, chatId, report);
    console.log("✓ report sent to Telegram");
  } catch (err) {
    console.error("✗", err.message);
    process.exit(1);
  }
})();
