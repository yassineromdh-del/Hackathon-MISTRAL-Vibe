"""Self-healing bot for the security gate.

open  <report.json> : gate blocked -> open an issue containing a ready-to-paste fix-prompt
close               : gate green   -> close every open security-gate issue
"""
import json
import os
import sys
import urllib.request

API = "https://api.github.com"
REPO = os.environ["GITHUB_REPOSITORY"]
SHA = os.environ.get("GITHUB_SHA", "")[:7]
RUN_URL = (
    f"https://github.com/{REPO}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"
)
LABEL = "security-gate"


def gh(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        print(f"::warning::GitHub API {e.code} on {method} {path}: {e.read().decode()[:200]}")
        return None


def ensure_label():
    gh(f"/repos/{REPO}/labels", "POST", {
        "name": LABEL,
        "color": "d03b3b",
        "description": "Opened automatically when the security gate blocks a commit",
    })


def blocking_items(report):
    items = []
    for f in report.get("semgrep_findings", []):
        if f.get("blocking"):
            items.append({
                "tool": "semgrep", "where": f"{f['file']}:{f['line']}",
                "what": f"{f['rule']} — {f['message']}", "fix": f.get("remediation", ""),
            })
    for v in report.get("trivy_vulnerabilities", []):
        if v.get("blocking"):
            items.append({
                "tool": "trivy", "where": f"{v['package']} {v['installed']}",
                "what": f"{v['id']} — {v['title']}", "fix": v.get("remediation", ""),
            })
    for l in report.get("gitleaks_leaks", []):
        items.append({
            "tool": "gitleaks", "where": f"{l['file']}:{l['line']} (commit {l['commit']})",
            "what": f"{l['rule']} — {l['description']}", "fix": l.get("remediation", ""),
        })
    return items


def open_issue(report_path):
    try:
        report = json.load(open(report_path))
    except Exception:
        report = {}
    items = blocking_items(report)
    jobs = report.get("jobs", {})

    lines = [
        f"La security gate a **bloqué** le commit `{SHA}` ([run]({RUN_URL})).",
        "",
        f"Jobs : semgrep `{jobs.get('semgrep', '?')}` · gitleaks `{jobs.get('gitleaks', '?')}` · trivy `{jobs.get('trivy', '?')}`",
        "",
        "## Findings bloquants",
        "",
    ]
    if items:
        for i, it in enumerate(items, 1):
            lines += [
                f"**{i}. [{it['tool']}]** `{it['where']}`",
                f"   - Problème : {it['what']}",
                f"   - Solution : {it['fix']}",
                "",
            ]
    else:
        lines += ["_Aucun détail exploitable dans le rapport (échec d'infra CI ?) — voir les logs du run._", ""]

    prompt = [
        f"The security gate blocked commit {SHA} on {REPO}. Fix every finding below, then commit.",
        "Rules: iterate through AI prompting only; NEVER weaken the gate "
        "(.semgrep.yml, .gitleaks.toml, the workflow) to silence a finding; "
        "a false positive goes through security/waivers.json with a justification.",
        "",
    ]
    for i, it in enumerate(items, 1):
        prompt.append(f"{i}. [{it['tool']}] {it['where']} — {it['what']} Fix: {it['fix']}")

    lines += [
        "## 🤖 Fix-prompt — à coller tel quel dans Claude / Cursor",
        "",
        "```text",
        *prompt,
        "```",
        "",
        "_Issue ouverte automatiquement par la security gate. Elle sera fermée d'elle-même quand la gate repassera au vert._",
    ]

    ensure_label()
    issue = gh(f"/repos/{REPO}/issues", "POST", {
        "title": f"\U0001F534 Security gate blocked — {SHA}",
        "body": "\n".join(lines),
        "labels": [LABEL],
    })
    if issue:
        print(f"opened issue #{issue['number']}: {issue['html_url']}")


def close_issues():
    issues = gh(f"/repos/{REPO}/issues?labels={LABEL}&state=open&per_page=50") or []
    for issue in issues:
        gh(f"/repos/{REPO}/issues/{issue['number']}/comments", "POST", {
            "body": f"✅ Gate verte sur `{SHA}` ([run]({RUN_URL})) — findings corrigés, fermeture automatique.",
        })
        gh(f"/repos/{REPO}/issues/{issue['number']}", "PATCH", {"state": "closed", "state_reason": "completed"})
        print(f"closed issue #{issue['number']}")
    if not issues:
        print("no open security-gate issue to close")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    if mode == "open":
        open_issue(sys.argv[2])
    elif mode == "close":
        close_issues()
    else:
        sys.exit("usage: security_gate_bot.py open <report.json> | close")
