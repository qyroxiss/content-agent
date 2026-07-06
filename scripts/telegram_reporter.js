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

// Ideas are pre-computed in scripts/pull_data.js (data.ideas / data.featuredIdeaIndex)
// so the Telegram report and the dashboard always agree on the same ranked ideas
// and rotate through the same "featured" pick day to day, instead of both
// recomputing independently and getting stuck on the single all-time top post.
function featuredIdea(data) {
  const ideas = data.ideas || [];
  if (!ideas.length) return null;
  return ideas[(data.featuredIdeaIndex || 0) % ideas.length];
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
  const idea = featuredIdea(data);
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
  if (data.own.asOf) {
    const days = Math.floor((Date.now() - new Date(data.own.asOf).getTime()) / 86400000);
    lines.push(`⚠ own stats are manually entered, as of ${data.own.asOf} (${days}d old) — Instagram still blocks the automated scraper for this account`);
  }
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
