#!/usr/bin/env python3
"""
Zero-to-Prod Gate — App backend (configless, install-once).

A GitHub App (and a GitLab webhook) installed ONCE on an account: every repo,
present and future, is scanned on push/PR with no file, no ruleset, no per-repo
config. The verdict is posted back as a Check Run (GitHub) / commit status
(GitLab) — which blocks the merge on any plan — and the report is upserted into
Supabase for the dashboard.

Deploy as a single serverless container (Cloud Run / Fly). The scan engine is
gate.py, imported directly — the same code the CLI used.

Env:
  GITHUB_APP_ID            numeric App id
  GITHUB_APP_PRIVATE_KEY   the App's PEM private key (contents, not a path)
  GITHUB_WEBHOOK_SECRET    webhook secret configured on the App
  GITLAB_WEBHOOK_TOKEN     secret token configured on the GitLab webhook (optional)
  GITLAB_TOKEN             group/project access token to clone + post status (optional)
  GITLAB_API              https://gitlab.com/api/v4 (default)
  SUPABASE_URL, SUPABASE_SERVICE_KEY   central store
  GATE_VERSION             recorded on each report (default: app)
"""
import hashlib
import hmac
import os
import subprocess
import tempfile
import time
import urllib.parse

import jwt          # PyJWT[crypto]
import requests
from flask import Flask, request

from gate import run_gate, publish, is_open

app = Flask(__name__)

GH_API = "https://api.github.com"
GL_API = os.environ.get("GITLAB_API", "https://gitlab.com/api/v4")
GATE_VERSION = os.environ.get("GATE_VERSION", "app")


# --------------------------------------------------------------------------
#  GitHub App auth
# --------------------------------------------------------------------------
def _app_jwt():
    now = int(time.time())
    payload = {"iat": now - 60, "exp": now + 540, "iss": os.environ["GITHUB_APP_ID"]}
    return jwt.encode(payload, os.environ["GITHUB_APP_PRIVATE_KEY"], algorithm="RS256")


def _installation_token(installation_id):
    r = requests.post(
        f"{GH_API}/app/installations/{installation_id}/access_tokens",
        headers={"Authorization": f"Bearer {_app_jwt()}", "Accept": "application/vnd.github+json"},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()["token"]


def _verify_github_sig(body, header):
    secret = os.environ.get("GITHUB_WEBHOOK_SECRET", "").encode()
    expected = "sha256=" + hmac.new(secret, body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header or "")


# --------------------------------------------------------------------------
#  Shared: clone at a commit, run the engine
# --------------------------------------------------------------------------
def _clone_and_scan(clone_url, repo_full, head_sha, provider):
    with tempfile.TemporaryDirectory() as tmp:
        # Full history: gitleaks scans past commits. Fetch the exact head.
        subprocess.run(["git", "clone", "--quiet", clone_url, tmp], check=True)
        subprocess.run(["git", "-C", tmp, "fetch", "--quiet", "origin", head_sha], check=False)
        subprocess.run(["git", "-C", tmp, "checkout", "--quiet", head_sha], check=False)
        report = run_gate(tmp, repo_full, head_sha, provider, GATE_VERSION)
        publish(report)  # Supabase upsert (no-op if unconfigured)
        return report


def _summary(report):
    tone = {"A+": "🟢", "A": "🟢", "B": "🟡", "C": "🟠", "D": "🔴", "F": "🔴"}.get(report["grade"], "⚪")
    lines = [f"## {tone} Vibe Security Score: **{report['grade']}** ({report['score']}/100)", "",
             f"{report['blocking_count']} blocking · {report['advisory_count']} advisory · "
             f"{len(report['waivers'])} waiver(s)", "", "| Scan | Verdict |", "|---|---|"]
    for k, v in report["jobs"].items():
        lines.append(f"| {k.capitalize()} | {'✅' if v == 'success' else '❌'} {v} |")
    return "\n".join(lines)


# --------------------------------------------------------------------------
#  GitHub webhook
# --------------------------------------------------------------------------
@app.post("/webhook/github")
def github_webhook():
    body = request.get_data()
    if not _verify_github_sig(body, request.headers.get("X-Hub-Signature-256")):
        return "bad signature", 401
    event = request.headers.get("X-GitHub-Event")
    payload = request.get_json(silent=True) or {}

    if event == "pull_request" and payload.get("action") in ("opened", "synchronize", "reopened"):
        head_sha = payload["pull_request"]["head"]["sha"]
    elif event == "push":
        head_sha = payload.get("after")
    else:
        return "ignored", 202
    if not head_sha or head_sha.startswith("000000"):
        return "no head", 202

    repo_full = payload["repository"]["full_name"]
    installation_id = payload["installation"]["id"]
    token = _installation_token(installation_id)
    clone_url = f"https://x-access-token:{token}@github.com/{repo_full}.git"

    report = _clone_and_scan(clone_url, repo_full, head_sha, "github")

    # Check Run — blocks the merge on any plan, no ruleset needed.
    requests.post(
        f"{GH_API}/repos/{repo_full}/check-runs",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
        json={"name": "Vibe Security Gate", "head_sha": head_sha, "status": "completed",
              "conclusion": "success" if is_open(report) else "failure",
              "output": {"title": f"{report['grade']} ({report['score']}/100)",
                         "summary": _summary(report)}},
        timeout=20,
    ).raise_for_status()
    return "ok", 202


# --------------------------------------------------------------------------
#  GitLab webhook (push / merge request). Uses a group/project access token.
# --------------------------------------------------------------------------
@app.post("/webhook/gitlab")
def gitlab_webhook():
    if os.environ.get("GITLAB_WEBHOOK_TOKEN") and \
       request.headers.get("X-Gitlab-Token") != os.environ["GITLAB_WEBHOOK_TOKEN"]:
        return "bad token", 401
    payload = request.get_json(silent=True) or {}
    kind = payload.get("object_kind")
    if kind == "merge_request":
        head_sha = payload["object_attributes"]["last_commit"]["id"]
        repo_full = payload["project"]["path_with_namespace"]
    elif kind == "push":
        head_sha = payload.get("after")
        repo_full = payload["project"]["path_with_namespace"]
    else:
        return "ignored", 202
    if not head_sha or head_sha.startswith("000000"):
        return "no head", 202

    gl_token = os.environ.get("GITLAB_TOKEN", "")
    project_id = str(payload["project"]["id"])
    clone_url = payload["project"]["git_http_url"].replace(
        "https://", f"https://oauth2:{gl_token}@") if gl_token else payload["project"]["git_http_url"]

    report = _clone_and_scan(clone_url, repo_full, head_sha, "gitlab")

    # Commit status — pending→failed/success blocks the MR when required.
    enc = urllib.parse.quote(project_id, safe="")
    requests.post(
        f"{GL_API}/projects/{enc}/statuses/{head_sha}",
        headers={"PRIVATE-TOKEN": gl_token},
        params={"state": "success" if is_open(report) else "failed",
                "name": "vibe-security-gate",
                "description": f"{report['grade']} ({report['score']}/100)"},
        timeout=20,
    )
    return "ok", 202


@app.get("/healthz")
def healthz():
    return "ok", 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
