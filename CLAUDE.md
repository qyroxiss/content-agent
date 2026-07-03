# Content Agent Dashboard

Owner Instagram: @quietlystrange09
Niche: space & science facts

## What this is
A team of 5 AI agents that run @quietlystrange09's content pipeline:
1. **Ideator** — scouts content ideas from own + competitor data
2. **Hook & Script** — writes hooks and scripts for top ideas
3. **Planner** — plans a daily content calendar
4. **Analyst** — analyses post stats and trends
5. **DM Manager** — drafts DM replies / triages inbound

All shown on a dashboard (dashboard/), reporting daily to Telegram.

## Competitors
- kurzgesagt
- spacefacts.ig
- didyouknowfacts
- sciencefactshindi
- space.ifacts
- earthpix
- natgeo
- bbcearth

## Structure
- `scripts/`    — data pull (Apify), agent logic, Telegram reporter, daily runner
- `dashboard/`  — the UI + data.json (generated, real stats)
- `.github/workflows/daily-report.yml` — GitHub Actions cron (09:00 IST / 03:30 UTC) that runs scripts/run_daily.js in the cloud and commits the refreshed data.json back
- `.env`        — secrets (APIFY_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Gitignored. NEVER commit. Mirrored as GitHub Actions repo secrets for the cloud workflow.
- `.env.example`— template showing required keys, safe to commit

## Rules of the build
- One step at a time, verified before moving on
- Tokens ONLY in .env locally / GitHub Actions secrets in the cloud (owner rotated the Apify token on 2026-07-03 after accidental exposure)
- Improve existing files, don't replace them

## Progress
- [x] Step 1: folder scaffold
- [~] Step 2: pull real data via Apify → dashboard/data.json — 7 of 8 competitors live-pulled on 2026-07-03; space.ifacts returned no data (likely wrong/nonexistent handle); @quietlystrange09's own data is manually entered in data.json — Instagram's guest/anti-bot layer blocks Apify's unauthenticated scraper from small/new accounts (13 followers), independent of the account's public/private setting. Re-attempt an automated pull once the account has more followers/history.
- [x] Step 3: dashboard with 5 agents — dashboard/index.html + style.css + app.js, served via `node scripts/serve_dashboard.js`; verified in browser (light/dark/mobile)
- [x] Step 4: Telegram bot — scripts/telegram_reporter.js sends a daily digest (own stats, top Ideator idea, Analyst best/worst post, DM Manager status) to Telegram via bot API; bot @quietlystrange_bot created 2026-07-03, verified delivery. NOTE: bot token was pasted in plaintext during setup — owner should rotate it via @BotFather (/revoke) and update .env when convenient, same as the Apify token incident.
- [x] Step 5: automation (schedule) — GitHub Actions (repo: github.com/qyroxiss/content-agent, private) instead of local Windows Task Scheduler, so it runs even when the owner's PC is off. scripts/run_daily.js chains pull_data.js + telegram_reporter.js; .github/workflows/daily-report.yml runs it daily at 09:00 IST / 03:30 UTC and commits data.json back. Verified 2026-07-03 via manual workflow_dispatch runs — own-account data initially got clobbered with nulls by the automated pull (see scripts/own_manual.json fallback fix), re-verified working after the fix.
- [ ] Step 6: full cycle proof — confirm the actual scheduled 09:00 IST cron trigger fires on its own (not just manual workflow_dispatch), and that a `git pull` locally picks up the auto-committed data.json.
