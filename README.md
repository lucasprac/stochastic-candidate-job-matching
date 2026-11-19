# Talento & Consenso — Stochastic Candidate–Job Matching

[![Live Demo](https://img.shields.io/badge/demo-GitHub%20Pages-2d5bff?style=flat-square)](https://lucasprac.github.io/stochastic-candidate-job-matching/)
[![License: MIT](https://img.shields.io/badge/License-MIT-3f7a3a?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?style=flat-square)](https://vite.dev/)

An interactive decision-support studio for multi-evaluator candidate–job matching built on **evidential belief distributions**, **explicit missing-evidence (ignorance) modeling**, and **Monte Carlo stochastic consensus analysis**.

**[Open Live Interactive Demo on GitHub Pages →](https://lucasprac.github.io/stochastic-candidate-job-matching/)**

---

## Overview

Traditional hiring scorecards average evaluator ratings into a single number, hiding two critical sources of hiring risk:

1. **Missing evidence** — a candidate whose dossier lacks evidence on a criterion is silently conflated with a candidate who performed poorly.
2. **Panel disagreement** — two evaluators strongly disagreeing produce the same average as two evaluators mildly agreeing.

**Talento & Consenso** models each evaluator's assessment as a belief distribution over rubric grades plus an explicit ignorance mass (`NOUL` / missing evidence), aggregates them using evidential reasoning, and runs Monte Carlo stochastic simulations to quantify:

- **Expected utility intervals & probabilistic rankings** (`P(rank = 1)`, win probabilities, score distributions)
- **Panel consensus index** against a configurable threshold
- **Evaluator disagreement & sensitivity** across criterion weights, rigor (`α`), and live edits to individual belief matrices

The entire mathematical engine (`src/stochastic/consensus.ts`) runs **100% client-side in the browser**, so the GitHub Pages deployment is immediately interactive with preloaded case studies and editable belief matrices.

---

## Features

- **Interactive Stochastic Consensus Studio**: Configure job descriptions, up to 6 candidates, weighted evaluation criteria, custom rubric grades, and multi-perspective hiring panels.
- **Live Belief Matrix Editor**: Inspect and adjust each evaluator's belief distribution and uncertainty mass per candidate/criterion with real-time Monte Carlo recalculation.
- **Sensitivity Controls**: Tune the rigor/risk-attitude parameter (`α`), consensus threshold, Monte Carlo trial count (`1,000` – `10,000`), and deterministic random seed.
- **Quick Triage Playground**: Fast structured evaluation mode (`choice`, `score`, `noul` questions) for ad-hoc screening checks.
- **Optional SubQ API Proxy**: Run live AI-assisted elicitation through `/api/decide` — locally via Vite's server middleware, or on Vercel via the serverless functions in `api/` (both share `snap-server.ts`). API keys never go into client bundles.
- **Light & Dark Editorial Theme**: High-contrast editorial typography (`Libre Baskerville`, `Geist Variable`, `Roboto Mono`) with automatic and manual theme switching.

---

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+ (22 recommended)
- npm

### Install & Run

```bash
git clone https://github.com/lucasprac/stochastic-candidate-job-matching.git
cd stochastic-candidate-job-matching
npm install
npm run dev
```

Open `http://localhost:5173`.

### Optional: Enable Live AI Elicitation Proxy

Copy `.env.example` to `.env` and set your SubQ API key (server-side only; never prefixed with `VITE_`). The local proxy uses it. The Vercel functions use it only with a spending cap (see **Owner key with a spending cap** below):

```bash
cp .env.example .env
# Edit .env and set SUBQ_API_KEY=...
```

---

## Deployment

### Vercel (static app + AI proxy)

`vercel.json` builds the Vite app into `dist/` and sends the security headers from `security-headers.ts` (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`). `api/health.ts` and `api/decide.ts` serve `/api/health` and `/api/decide` with the same validation as the local proxy, in **hosted mode**:

- Without the setup below, each visitor must enter their own SubQ key in **Configurações**, and the function does not use `SUBQ_API_KEY`.
- A browser `Origin` must be the same origin as the deployment (`https` only).
- Concurrency limits (3 per client IP, 6 in total) live in memory **per function instance**. For a real per-IP rate limit, add a Vercel Firewall rate-limiting rule for `/api/decide`.

#### Owner key with a spending cap

To let visitors use your key, set these in the Vercel project (Settings → Environment Variables):

1. `SUBQ_API_KEY`: your key. It stays on the server. `/api/health` returns only `hasServerKey: true/false`, and error messages remove the key.
2. A shared store for the spent amount: add **Upstash for Redis** from the Vercel Marketplace and connect it to the project. It adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` also work).
3. Optional: `SUBQ_DEMO_BUDGET_USD` (default `3`) and `SUBQ_PRICE_USD_PER_MILLION_TOKENS` (default `0.04`, the `subq-snap-1.2` input price).

How the cap works (`demo-budget.ts`):

- The cap is a **total for the life of the counter**, not per month. To start again, delete the key `subq-demo-budget:input-tokens` in the store.
- Before each call, the function reserves an upper bound of the cost (request bytes + 4,096 tokens) with an atomic `INCRBY`. If the total passes the cap, it gives the reservation back and returns `402 demo_budget_exhausted`. After a successful call, it corrects the reservation to the billed `usage.input_tokens`. After a failed call, it keeps the reservation, because SubQ does not document which failed calls are billed. So the counter can be higher than the real spend, but not lower.
- If the store is missing, the key is not used. If the store does not answer, the function returns `503 demo_budget_unavailable` and does not call SubQ.
- A visitor who enters their own key is not charged against the cap, and can continue after the cap is spent.
- The cap limits cost, not abuse: one script can spend the whole budget quickly. Add the Firewall rule above. For a second, independent limit, use a SubQ account or key that has only the credits you accept to lose.

There is no SPA fallback rewrite on purpose: the app has no client-side routes, and with `base: './'` a deep path that served `index.html` would load `./assets` from the wrong folder.

### GitHub Pages (static only)

GitHub Pages cannot run `/api/*` or send headers. The build adds the CSP as a `<meta>` tag (without `frame-ancestors`, which browsers ignore in `<meta>`). The app detects the missing proxy and runs in demo mode.

### Security notes

- **API key in the browser**: the key is stored without encryption — in `sessionStorage` by default, or in `localStorage` for 7 days when "keep in this browser" is on. Any script on the page or a browser extension can read it. Use a key with a spending limit. The owner's `SUBQ_API_KEY` is never sent to the browser.
- **CSV export**: values that a spreadsheet would read as formulas (`=`, `+`, `-`, `@`, tab, CR) get a leading apostrophe (`src/lib/csv.ts`). The JSON audit export is not changed, because spreadsheets do not run JSON and changing values would corrupt the audit record.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server with local `/api/decide` & `/api/health` proxy |
| `npm run build` | Type-check (`tsc -b`) and build static bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit, proxy & security-header tests (`69` tests) |
| `npm run typecheck` | Run strict TypeScript check without emitting files |

---

## Project Structure

```text
├── api/                           # Vercel serverless functions (/api/health, /api/decide)
├── public/                        # Static assets (favicon, robots.txt, theme-init.js)
├── skills/
│   └── stochastic-belief-consensus/  # Mathematical method notes & Python reference
├── src/
│   ├── components/                # UI layout, Hero, Header, Footer, Evaluator & Results
│   ├── data/presets.ts            # Case-study presets & synthetic demo dataset
│   ├── lib/                       # API client, storage helpers, formatting, metadata
│   ├── stochastic/                # Core evidential & Monte Carlo consensus engine + tests
│   └── types/                     # TypeScript definitions
├── snap-server.ts                 # Local Vite proxy middleware for optional API calls
├── snap-server.test.ts            # Proxy security & behavior tests
├── demo-budget.ts                 # Spending cap for the owner key on Vercel (Upstash REST)
├── security-headers.ts            # CSP and security headers (mirrored in vercel.json)
├── vercel.json                    # Vercel build + headers
└── LICENSE                        # MIT License
```

---

## License

Copyright (c) 2026 Lucas Praciano. Released under the [MIT License](./LICENSE).
