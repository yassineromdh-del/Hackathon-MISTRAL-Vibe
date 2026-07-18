# Zero-to-Prod — Security Gate Dashboard

Micro-SaaS built for the **"Zero-to-Prod in 8 Hours: Security-Native Vibe Coding"** hackathon:
the entire app is built through AI conversation, and every commit must pass an automated
security gate (Semgrep + Gitleaks + Trivy) before merge — no manual code review, only
prompt iteration.

This dashboard **is** the product: it visualizes the security gate of its own repository.

## Features

- **Gate hero** — is the latest commit blocked or clear to merge?
- **Per-tool status cards** — Semgrep (SAST), Gitleaks (secrets), Trivy (dependencies),
  with direct links to job logs.
- **Run history table** — commit, branch, trigger, duration, verdict for the last 20 runs.
- **GitHub OAuth via Supabase** — your app role (maintainer / contributor / viewer) is
  derived live from your GitHub collaborator permission on the repo.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite + React 18 + Tailwind CSS |
| Auth | Supabase (GitHub OAuth) |
| Data source | GitHub Actions API (workflow runs + jobs) |
| Security gate | GitHub Actions: Semgrep, Gitleaks, Trivy |

## Getting started

```bash
cp .env.example .env   # fill in Supabase URL + anon key
npm install
npm run dev            # http://localhost:3000
```

In Supabase: enable the **GitHub** auth provider and add `http://localhost:3000`
to the allowed redirect URLs.

## The security gate

`.github/workflows/security-gate.yml` runs three scans on every push/PR:

1. **Semgrep** — registry rules (`--config auto`) + custom rules in `.semgrep.yml`
   (hardcoded secrets, eval, XSS sinks, Supabase service-role leaks, AI endpoints
   called from the browser). Fails on ERROR severity.
2. **Gitleaks** — secret detection over full git history, config in `.gitleaks.toml`.
3. **Trivy** — filesystem scan of dependencies, fails on HIGH/CRITICAL.

A final **Security Gate Decision** job fails if any scan fails — wire it as a required
status check on `main` to actually block merges.

## Rules of the game

- No manual code edits: every change comes from an AI prompt.
- A failing gate is fixed by iterating the prompt, not by weakening the gate.
- The prompt trail (commit messages + conversation log) is part of the deliverable.
