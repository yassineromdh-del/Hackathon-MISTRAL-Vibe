# Zero-to-Prod — Security Gate Dashboard

![Security Gate](https://github.com/yassineromdh-del/Hackathon-MISTRAL-Vibe/actions/workflows/security-gate.yml/badge.svg?branch=main)
![Vibe Security Score](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fyassineromdh-del%2FHackathon-MISTRAL-Vibe%2Fgate-reports%2Flatest.json&query=%24.grade&label=vibe%20security%20score&color=2a78d6)

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

<!-- gate smoke test: 2026-07-23 — witness commit to exercise the security gate -->

## Déploiement configless — une App installée une fois (sans fichier dans les repos)

Le gate n'est **ni copié ni configuré** dans les repos. Une **GitHub App** (+ webhook
GitLab) installée **une seule fois** sur le compte scanne **tous les repos, présents
et futurs**, sur push/PR — **aucun fichier, aucun ruleset, aucun tier Enterprise**. Le
verdict revient en **Check Run** (GitHub) / **commit status** (GitLab), qui bloque le
merge sur n'importe quel plan ; le rapport est upserté dans **Supabase** pour le dashboard.

```
Install App (1 clic) ─▶ webhook push/PR (tous les repos) ─▶ backend: gate.py scanne
        └─▶ Check Run / commit status (bloque le merge)  +  upsert Supabase ─▶ dashboard
```

| Composant | Fichier |
|---|---|
| Moteur de scan (importable + CLI) | `gate/gate.py`, `gate/Dockerfile` |
| Backend de l'App (webhook + Check Run) | `app/server.py`, `app/Dockerfile` |
| Enregistrement + déploiement | `app/README.md` |
| Store central | `supabase/migrations/0001_gate_reports.sql` |

- **Changer de compte** → installer l'App sur le nouveau compte (1 clic).
- **Ajouter un repo** → couvert automatiquement (grant « All repositories »).
- **Faire évoluer le gate** → redéployer ce seul service ; **rien ne touche les repos**.

La **seule** chose à héberger : ce backend (webhook + moteur), déployé une fois en
conteneur serverless (Cloud Run/Fly, scale-to-zero) — voir **`app/README.md`**. C'est
le modèle des scanners pros (Snyk, Semgrep, GitGuardian).

> `install-security-gate.sh` reste disponible comme **repli CI** (stub par repo) si
> tu ne veux pas héberger de backend, mais ce n'est plus le chemin recommandé.

