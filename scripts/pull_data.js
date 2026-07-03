#!/usr/bin/env node
/**
 * pull_data.js — pulls @qyroxis + competitor Instagram data via Apify
 * and writes normalized results to dashboard/data.json
 *
 * Usage:
 *   node scripts/pull_data.js          # real pull (needs APIFY_TOKEN in .env)
 *   node scripts/pull_data.js --mock   # generate sample data, no network
 *
 * Zero dependencies. Node 18+ (built-in fetch).
 */

const fs = require("fs");
const path = require("path");

// ---------- config (edit freely) ----------
const OWN_HANDLE = "quietlystrange09";
const COMPETITORS = ["kurzgesagt", "spacefacts.ig", "didyouknowfacts", "sciencefactshindi", "space.ifacts", "earthpix", "natgeo", "bbcearth"];
const OWN_POSTS_LIMIT = 100;   // how much of your own history to pull
const APIFY_ACTOR = "apify~instagram-scraper";
const POLL_INTERVAL_MS = 10_000;
const MAX_WAIT_MS = 10 * 60_000; // give a run up to 10 minutes
// -------------------------------------------

const ROOT = path.join(__dirname, "..");
const OUT_FILE = path.join(ROOT, "dashboard", "data.json");

// --- tiny .env parser (no dotenv dependency) ---
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

// --- Apify: start a run, poll until done, fetch dataset items ---
async function runActor(token, input, label) {
  console.log(`▶ starting Apify run: ${label} ...`);
  const startRes = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${token}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
  );
  if (!startRes.ok) throw new Error(`Apify start failed (${startRes.status}): ${await startRes.text()}`);
  const run = (await startRes.json()).data;

  const deadline = Date.now() + MAX_WAIT_MS;
  let status = run.status;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
    if (Date.now() > deadline) throw new Error(`Run ${label} exceeded ${MAX_WAIT_MS / 60000} min`);
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const s = await fetch(`https://api.apify.com/v2/actor-runs/${run.id}?token=${token}`);
    status = (await s.json()).data.status;
    process.stdout.write(`  ...${status}\r`);
  }
  console.log(`\n  run ${label} finished: ${status}`);
  if (status !== "SUCCEEDED") throw new Error(`Run ${label} ended with status ${status}`);

  const itemsRes = await fetch(
    `https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${token}&clean=true`
  );
  return itemsRes.json();
}

// --- normalize a raw post item into our dashboard shape ---
function normPost(p) {
  return {
    id: p.id || p.shortCode || p.url,
    url: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : null),
    type: p.type || (p.videoViewCount != null ? "Video" : "Image"),
    caption: (p.caption || "").slice(0, 500),
    hashtags: p.hashtags || [],
    likes: p.likesCount ?? null,
    comments: p.commentsCount ?? null,
    views: p.videoViewCount ?? p.videoPlayCount ?? null,
    timestamp: p.timestamp || null,
  };
}

function engagement(posts, followers) {
  const scored = posts.filter(p => p.likes != null);
  if (!scored.length || !followers) return null;
  const avg = scored.reduce((s, p) => s + p.likes + (p.comments || 0), 0) / scored.length;
  return +((avg / followers) * 100).toFixed(2);
}

async function realPull() {
  const env = loadEnv();
  const token = env.APIFY_TOKEN;
  if (!token || token === "your_apify_token_here") {
    console.error("✗ APIFY_TOKEN missing in .env — add your (rotated) token first.");
    process.exit(1);
  }

  const allHandles = [OWN_HANDLE, ...COMPETITORS];

  // Run 1: profile details (followers + recent posts for everyone)
  const details = await runActor(token, {
    directUrls: allHandles.map(h => `https://www.instagram.com/${h}/`),
    resultsType: "details",
    resultsLimit: 1,
  }, "profile details");

  // Run 2: your own post history
  const ownPosts = await runActor(token, {
    directUrls: [`https://www.instagram.com/${OWN_HANDLE}/`],
    resultsType: "posts",
    resultsLimit: OWN_POSTS_LIMIT,
  }, `own posts (@${OWN_HANDLE})`);

  return buildOutput(details, ownPosts);
}

function buildOutput(details, ownPostsRaw) {
  const profiles = {};
  for (const d of details) {
    const handle = (d.username || "").toLowerCase();
    if (!handle) continue;
    profiles[handle] = {
      handle,
      fullName: d.fullName || handle,
      followers: d.followersCount ?? null,
      following: d.followsCount ?? null,
      postsCount: d.postsCount ?? null,
      bio: d.biography || "",
      recentPosts: (d.latestPosts || []).map(normPost),
    };
  }

  const own = profiles[OWN_HANDLE] || { handle: OWN_HANDLE, recentPosts: [] };
  own.posts = ownPostsRaw.map(normPost)
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  own.engagementRate = engagement(own.posts, own.followers);

  const competitors = COMPETITORS.map(h => {
    const c = profiles[h] || { handle: h, recentPosts: [] };
    c.engagementRate = engagement(c.recentPosts, c.followers);
    return c;
  });

  return {
    generatedAt: new Date().toISOString(),
    source: "apify/instagram-scraper",
    own,
    competitors,
  };
}

// --- mock mode: same shape, fake numbers, so the pipeline is testable offline ---
function mockPull() {
  const rand = (a, b) => Math.floor(a + Math.random() * (b - a));
  const mkPosts = (n, base) => Array.from({ length: n }, (_, i) => ({
    id: `mock_${base}_${i}`,
    url: `https://www.instagram.com/p/mock${base}${i}/`,
    type: i % 3 === 0 ? "Video" : "Image",
    caption: `${["Deep sea creatures", "Black holes", "Ancient civilizations", "Quantum physics", "Extinct megafauna"][i % 5]} #space #science`,
    hashtags: ["space", "science"],
    likes: rand(40, 900),
    comments: rand(2, 60),
    views: i % 3 === 0 ? rand(1000, 20000) : null,
    timestamp: new Date(Date.now() - i * 86400000 * rand(1, 3)).toISOString(),
  }));
  const mkProfile = (handle, followers) => ({
    handle, fullName: handle, followers,
    following: rand(100, 900), postsCount: rand(80, 600),
    bio: `Mock bio for ${handle}`, recentPosts: mkPosts(12, handle),
  });

  const details = [];
  const own = mkProfile(OWN_HANDLE, rand(1500, 6000));
  const ownPosts = mkPosts(60, "own");
  // reuse buildOutput by faking the raw shapes it expects
  const rawDetails = [own, ...COMPETITORS.map(h => mkProfile(h, rand(5000, 90000)))].map(p => ({
    username: p.handle, fullName: p.fullName, followersCount: p.followers,
    followsCount: p.following, postsCount: p.postsCount, biography: p.bio,
    latestPosts: p.recentPosts.map(x => ({ ...x, likesCount: x.likes, commentsCount: x.comments })),
  }));
  const rawOwnPosts = ownPosts.map(x => ({ ...x, likesCount: x.likes, commentsCount: x.comments }));
  const out = buildOutput(rawDetails, rawOwnPosts);
  out.source = "MOCK DATA — run without --mock for real numbers";
  return out;
}

(async () => {
  try {
    const mock = process.argv.includes("--mock");
    const data = mock ? mockPull() : await realPull();
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));
    console.log(`✓ wrote ${OUT_FILE}`);
    console.log(`  own posts: ${data.own.posts.length}, competitors: ${data.competitors.length}`);
    console.log(`  own followers: ${data.own.followers}, engagement: ${data.own.engagementRate}%`);
  } catch (err) {
    console.error("✗ pull failed:", err.message);
    process.exit(1);
  }
})();
