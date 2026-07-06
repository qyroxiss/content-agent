// app.js — reads dashboard/data.json and renders the 5-agent dashboard.
// Ideator/Hook&Script/Planner are simple heuristics over real pulled data
// (no LLM wired up yet — that lands with the automation step), computed
// once in scripts/pull_data.js so the dashboard and the Telegram report
// always agree on the same ranked ideas and the same daily "featured" pick.
// Analyst renders real numbers only. DM Manager shows templates until a
// real inbox is wired up.

function fmtPct(n) {
  return n == null ? "—" : `${n.toFixed(2)}%`;
}

function fmtNum(n) {
  return n == null ? "—" : n.toLocaleString();
}

function timeAgo(iso) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

async function main() {
  let data;
  try {
    const res = await fetch("data.json");
    data = await res.json();
  } catch (err) {
    document.getElementById("generatedAt").textContent = "failed to load data.json — run `node scripts/pull_data.js --mock` first";
    return;
  }

  renderHeader(data);
  const ideas = renderIdeator(data);
  const featuredIndex = ideas.length ? (data.featuredIdeaIndex || 0) % ideas.length : 0;
  renderHookScript(ideas, featuredIndex, data.own.handle);
  renderPlanner(ideas, featuredIndex);
  renderAnalyst(data);
  renderDM(data);
}

function renderHeader(data) {
  document.title = `@${data.own.handle} — content agent dashboard`;
  document.getElementById("brandHandle").textContent = `@${data.own.handle} · content ops`;
  document.getElementById("generatedAt").textContent =
    `data pulled ${timeAgo(data.generatedAt)}`;

  const missing = data.competitors.filter(c => !c.followers && !c.recentPosts.length);
  const badgeEl = document.getElementById("dataBadge");
  const badges = [];
  if (missing.length) {
    badges.push(`<span class="badge warning">${missing.length} of ${data.competitors.length} competitors: no data (${missing.map(c => c.handle).join(", ")})</span>`);
  }
  if (data.own.asOf) {
    const days = Math.floor((Date.now() - new Date(data.own.asOf).getTime()) / 86400000);
    badges.push(`<span class="badge warning">own stats manually entered, as of ${data.own.asOf} (${days}d old)</span>`);
  }
  badgeEl.innerHTML = badges.join(" ");

  const kpiRow = document.getElementById("kpiRow");
  const withData = data.competitors.filter(c => c.engagementRate != null);
  const avgCompetitor = withData.length
    ? withData.reduce((s, c) => s + c.engagementRate, 0) / withData.length
    : null;

  const kpis = [
    { label: "Own followers", value: fmtNum(data.own.followers), sub: `@${data.own.handle}` },
    { label: "Own engagement rate", value: fmtPct(data.own.engagementRate), sub: `${data.own.posts.length} posts analyzed` },
    { label: "Competitor avg engagement", value: fmtPct(avgCompetitor), sub: `${withData.length}/${data.competitors.length} with data` },
    { label: "Competitors tracked", value: String(data.competitors.length), sub: data.source.startsWith("MOCK") ? "mock data" : "live pull" },
  ];
  kpiRow.innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      <div class="sub">${k.sub}</div>
    </div>
  `).join("");
}

// ---------- 01 Ideator ----------
function renderIdeator(data) {
  const ideas = data.ideas || [];
  const listEl = document.getElementById("ideaList");
  if (!ideas.length) {
    listEl.innerHTML = `<div class="idea"><div class="rationale">Not enough competitor post data yet to derive ideas — re-pull once more competitor handles are confirmed.</div></div>`;
  } else {
    listEl.innerHTML = ideas.map(i => `
      <div class="idea">
        <div class="title">${i.title}</div>
        <div class="rationale">${i.rationale}</div>
        <div class="tags">${i.tags.map(t => `<span class="tag">#${t}</span>`).join("")}</div>
      </div>
    `).join("");
  }
  return ideas;
}

// ---------- 02 Hook & Script ----------
function renderHookScript(ideas, featuredIndex, ownHandle) {
  const el = document.getElementById("scriptOut");
  if (!ideas.length) {
    el.innerHTML = `<div class="script-card">No idea to draft from yet — waiting on the Ideator.</div>`;
    return;
  }
  const idea = ideas[featuredIndex];
  const hooks = [
    `Everyone's talking about ${idea.title.toLowerCase()}. Here's what most people get wrong.`,
    `This fact about ${idea.title.toLowerCase()} sounds fake. It isn't.`,
    `${idea.title} — the number that doesn't add up until you see the scale.`,
  ];
  el.innerHTML = `
    <div class="script-card">
      <div class="hook">"${hooks[0]}"</div>
      <div class="part"><b>Hook</b>${hooks[0]}</div>
      <div class="part"><b>Body</b>Lead with the surprising number or comparison, cite the source, close with a twist fact that reframes it.</div>
      <div class="part"><b>CTA</b>Follow @${ownHandle} for facts that don't feel like homework.</div>
      <div class="tags">${idea.tags.map(t => `<span class="tag">#${t}</span>`).join("")}</div>
    </div>
  `;
}

// ---------- 03 Planner ----------
function renderPlanner(ideas, featuredIndex) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const formats = ["Video", "Sidecar", "Image"];
  const body = document.getElementById("calendarBody");
  body.innerHTML = days.map((d, i) => {
    const idea = ideas.length ? ideas[(featuredIndex + i) % ideas.length] : null;
    return `
      <tr>
        <td class="day">${d}</td>
        <td>${idea ? idea.title : "—"}</td>
        <td>${formats[i % formats.length]}</td>
      </tr>
    `;
  }).join("");
}

// ---------- 04 Analyst ----------
function renderAnalyst(data) {
  const rows = [
    { name: `@${data.own.handle}`, rate: data.own.engagementRate, own: true },
    ...data.competitors.map(c => ({ name: `@${c.handle}`, rate: c.engagementRate, own: false })),
  ];
  const max = Math.max(1, ...rows.map(r => r.rate || 0));

  const chart = document.getElementById("engagementChart");
  chart.innerHTML = rows.map(r => {
    const pct = r.rate == null ? 0 : (r.rate / max) * 100;
    return `
      <div class="bar-row ${r.own ? "own" : ""} ${r.rate == null ? "nodata" : ""}">
        <div class="name">${r.name}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="val">${r.rate == null ? "no data" : fmtPct(r.rate)}</div>
      </div>
    `;
  }).join("");

  const ownPosts = [...data.own.posts].filter(p => p.likes != null);
  const best = ownPosts.sort((a, b) => (b.likes + (b.comments || 0)) - (a.likes + (a.comments || 0)))[0];
  const worst = ownPosts[ownPosts.length - 1];

  const callouts = document.getElementById("callouts");
  callouts.innerHTML = `
    <div class="callout">
      <div class="label">Best performing own post</div>
      ${best ? `<div>${fmtNum(best.likes)} likes · ${fmtNum(best.comments)} comments</div><p class="cap">${(best.caption || "").slice(0, 90)}…</p>` : "<div>Not enough posts yet</div>"}
    </div>
    <div class="callout">
      <div class="label">Lowest performing own post</div>
      ${worst ? `<div>${fmtNum(worst.likes)} likes · ${fmtNum(worst.comments)} comments</div><p class="cap">${(worst.caption || "").slice(0, 90)}…</p>` : "<div>Not enough posts yet</div>"}
    </div>
  `;
}

// ---------- 05 DM Manager ----------
function renderDM(data) {
  document.getElementById("dmPending").textContent =
    "No inbound DM source connected yet — this lands in Step 4 (Telegram bot / inbox wiring). The templates below are examples only.";

  const samples = [
    { in: "Where did you get this fact from? Source?", tag: "source" },
    { in: "Can I repost this to my page with credit?", tag: "reuse" },
    { in: "Love your page, want to collab or do a shoutout?", tag: "collab" },
  ];
  const replyFor = {
    source: `Great question — always linked in the caption or comments, but happy to send the specific study/article if you can't find it.`,
    reuse: `Sure, just credit @${data.own.handle} in the caption and don't crop the watermark — appreciate you asking first.`,
    collab: `Always open to it — what's your page about, and what did you have in mind?`,
  };

  document.getElementById("dmThreads").innerHTML = samples.map(s => `
    <div class="dm-thread">
      <div class="in">"${s.in}" <span class="chip">${s.tag}</span></div>
      <div class="out"><b>Draft reply</b>${replyFor[s.tag]}</div>
    </div>
  `).join("");
}

main();
