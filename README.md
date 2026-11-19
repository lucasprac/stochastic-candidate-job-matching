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
- **Optional Local SubQ API Proxy**: Run live AI-assisted elicitation locally via Vite's server middleware (`snap-server.ts`) without exposing API keys in client bundles.
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

Copy `.env.example` to `.env` and set your SubQ API key (server-side only; never prefixed with `VITE_`):

```bash
cp .env.example .env
# Edit .env and set SUBQ_API_KEY=...
```

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server with local `/api/decide` & `/api/health` proxy |
| `npm run build` | Type-check (`tsc -b`) and build static bundle into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest unit & proxy tests (`29` tests) |
| `npm run typecheck` | Run strict TypeScript check without emitting files |

---

## Project Structure

```text
├── public/                        # Static assets (favicon)
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
└── LICENSE                        # MIT License
```

---

## License

Copyright (c) 2026 Lucas Praciano. Released under the [MIT License](./LICENSE).
