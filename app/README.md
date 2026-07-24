# Zero-to-Prod Gate — App backend (install-once, configless)

One GitHub App (+ optional GitLab webhook) installed **once** on an account scans
**every repo, present and future**, on push/PR — **no file, no ruleset, no
per-repo config, no Enterprise tier**. The verdict is posted as a Check Run
(GitHub) / commit status (GitLab), which blocks the merge; the report is upserted
into Supabase for the dashboard.

- Change account → install the App on the new account (one click).
- Add a repo → covered automatically (grant "All repositories").
- Evolve the gate → redeploy this one service. Nothing touches the repos.

## The one thing you host: this service

It runs the scan engine (`../gate/gate.py`) behind a webhook. Deploy it once as a
serverless container (scale-to-zero).

### 1. Build & push the image
```bash
docker build -t ghcr.io/<org>/gate:v1 ../gate           # engine (scanners + gate.py)
docker build -t ghcr.io/<org>/gate-app:v1 \
  --build-arg GATE_IMAGE=ghcr.io/<org>/gate:v1 .          # engine + web server
docker push ghcr.io/<org>/gate-app:v1
```

### 2. Deploy (Cloud Run example)
```bash
gcloud run deploy gate-app --image ghcr.io/<org>/gate-app:v1 \
  --allow-unauthenticated --min-instances 0 --timeout 1800 \
  --set-env-vars GATE_VERSION=v1 \
  --set-secrets GITHUB_APP_ID=...,GITHUB_APP_PRIVATE_KEY=...,GITHUB_WEBHOOK_SECRET=...,SUPABASE_URL=...,SUPABASE_SERVICE_KEY=...
# → note the service URL, e.g. https://gate-app-xxxx.run.app
```

## Register the GitHub App (once)
GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**:
- **Webhook URL**: `https://<service-url>/webhook/github` · **Secret**: match `GITHUB_WEBHOOK_SECRET`
- **Permissions → Repository**: `Checks: Read & write`, `Contents: Read-only`, `Metadata: Read-only`
- **Subscribe to events**: `Pull request`, `Push`
- Generate a **private key** (PEM) → `GITHUB_APP_PRIVATE_KEY`; note the **App ID** → `GITHUB_APP_ID`
- **Install** the App on your account/org → **All repositories** (future repos auto-covered)

Push a commit / open a PR → a **Vibe Security Gate** check appears. Mark it a
required check once (org default) if you want it to hard-block.

## GitLab (optional, same service)
- Create a **group access token** (scope `api`) → `GITLAB_TOKEN`; pick a `GITLAB_WEBHOOK_TOKEN`.
- Group → Settings → Webhooks → URL `https://<service-url>/webhook/gitlab`, secret token = `GITLAB_WEBHOOK_TOKEN`, trigger on **Push** + **Merge request events**.
- Every project in the group is now scanned; the gate posts a commit status.

## Why this beats the CI-file approach
No workflow file per repo, no org ruleset, no GitHub Enterprise Cloud requirement,
no re-push when the gate changes — the App owns one credential and one deployment.
This is the model commercial scanners (Snyk, Semgrep, GitGuardian) use.
