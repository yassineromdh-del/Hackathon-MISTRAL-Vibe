#!/usr/bin/env python3
"""
Security gate — provider-agnostic engine.

Runs Semgrep + Gitleaks + Trivy over a source tree, computes the Vibe Security
Score, and returns a structured report. Importable (used by the App backend in
app/server.py) AND runnable as a CLI (one-shot scan + optional Supabase upsert).

The engine has NO knowledge of GitHub/GitLab plumbing: callers pass repo_full /
head_sha / provider and decide how to publish (Check Run, commit status, …) and
where to store (Supabase). That is what makes it configless per repo — the same
engine serves the App for every repo of every account.
"""
import glob
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone


def _run(cmd, src):
    print(f"$ {' '.join(cmd)}", flush=True)
    return subprocess.run(cmd, cwd=src, check=False)


def _scan(src):
    # git must trust the (possibly foreign-owned) checkout for gitleaks.
    subprocess.run(["git", "config", "--global", "--add", "safe.directory", src], check=False)

    semgrep_cfg = ["--config", "auto"]
    if os.path.isfile(os.path.join(src, ".semgrep.yml")):
        semgrep_cfg += ["--config", ".semgrep.yml"]
    _run(["semgrep", "scan", *semgrep_cfg, "--json", "--output", "semgrep-results.json", "."], src)

    gl_cfg = ["--config", ".gitleaks.toml"] if os.path.isfile(os.path.join(src, ".gitleaks.toml")) else []
    _run(["gitleaks", "git", *gl_cfg, "--log-opts=--full-history HEAD",
          "--report-format", "json", "--report-path", "gitleaks-results.json", "--redact", "."], src)

    _run(["trivy", "fs", "--scanners", "vuln", "--severity", "HIGH,CRITICAL",
          "--format", "json", "--output", "trivy-results.json", "--exit-code", "0", "."], src)


def _load(src, name):
    for p in glob.glob(os.path.join(src, name)):
        try:
            return json.load(open(p))
        except Exception:
            pass
    return None


def _semgrep_fix(rule):
    r = (rule or "").lower()
    if "mutable-action-tag" in r:
        return "Pin the action to a full commit SHA (uses: owner/action@<sha> # tag)."
    if "innerhtml" in r:
        return "Sanitize with DOMPurify before injecting, or render as plain text."
    if "eval" in r or "function" in r:
        return "Remove eval()/new Function(); use JSON.parse or an explicit code path."
    if "secret" in r or "hardcoded" in r or "password" in r or "token" in r:
        return "Move the value to an env var, rotate the credential, purge it from history."
    if "sql" in r or "injection" in r:
        return "Use parameterized queries; never concatenate user input into queries."
    if "bad-host" in r or "bad_host" in r:
        return "Bind to a specific interface or read the host from an env var, not 0.0.0.0."
    return f"See https://semgrep.dev/r/{rule}"


def _weight(sev):
    return {"CRITICAL": 40, "ERROR": 40, "HIGH": 20,
            "MEDIUM": 5, "WARNING": 5, "LOW": 1, "INFO": 1}.get(sev or "", 5)


def build_report(src, repo_full, head_sha, provider="github", gate_version="dev"):
    semgrep = _load(src, "semgrep-results.json")
    trivy = _load(src, "trivy-results.json")
    gitleaks = _load(src, "gitleaks-results.json")
    waivers = _load(src, "security/waivers.json") or []

    findings = []
    for r in (semgrep or {}).get("results", []):
        sev = r.get("extra", {}).get("severity")
        rule = r.get("check_id")
        findings.append({"severity": sev, "blocking": sev == "ERROR", "rule": rule,
                         "file": r.get("path"), "line": r.get("start", {}).get("line"),
                         "message": (r.get("extra", {}).get("message") or "")[:300],
                         "remediation": _semgrep_fix(rule)})

    vulns = []
    for res in (trivy or {}).get("Results") or []:
        for v in res.get("Vulnerabilities") or []:
            fixed, pkg = v.get("FixedVersion"), v.get("PkgName")
            vulns.append({"severity": v.get("Severity"), "blocking": v.get("Severity") in ("HIGH", "CRITICAL"),
                          "id": v.get("VulnerabilityID"), "package": pkg,
                          "installed": v.get("InstalledVersion"), "fixed": fixed,
                          "title": (v.get("Title") or "")[:200],
                          "remediation": (f"Upgrade {pkg} to {fixed}." if fixed
                                          else f"No fix yet for {pkg} — watch the advisory.")})

    leaks = []
    for l in gitleaks or []:
        leaks.append({"severity": "CRITICAL", "blocking": True, "rule": l.get("RuleID"),
                      "file": l.get("File"), "line": l.get("StartLine"),
                      "description": (l.get("Description") or "")[:200], "commit": (l.get("Commit") or "")[:7],
                      "remediation": "Rotate the secret, move it to an env var, purge it from git history."})

    penalty = sum(_weight(f["severity"]) for f in findings) + sum(_weight(v["severity"]) for v in vulns) \
        + sum(_weight(l["severity"]) for l in leaks) + 2 * len(waivers)
    score = max(0, 100 - penalty)
    grade = next(g for g, t in [("A+", 95), ("A", 85), ("B", 70), ("C", 50), ("D", 30), ("F", -1)] if score >= t)

    jobs = {"semgrep": "failure" if any(f["blocking"] for f in findings) else "success",
            "gitleaks": "failure" if leaks else "success",
            "trivy": "failure" if any(v["blocking"] for v in vulns) else "success"}
    blocking = sum(1 for f in findings if f["blocking"]) + sum(1 for v in vulns if v["blocking"]) \
        + sum(1 for l in leaks if l["blocking"])
    advisory = (len(findings) + len(vulns) + len(leaks)) - blocking

    return {"repo_full": repo_full, "provider": provider, "head_sha": head_sha, "sha": head_sha,
            "score": score, "grade": grade, "gate_version": gate_version,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "jobs": jobs, "blocking_count": blocking, "advisory_count": advisory,
            "semgrep_findings": findings, "trivy_vulnerabilities": vulns,
            "gitleaks_leaks": leaks, "waivers": waivers}


def run_gate(src, repo_full, head_sha, provider="github", gate_version="dev"):
    """Scan `src` and return the report dict. The importable entry point."""
    _scan(src)
    return build_report(src, repo_full, head_sha, provider, gate_version)


def is_open(report):
    return all(v == "success" for v in report["jobs"].values())


def publish(report, supabase_url=None, supabase_key=None):
    """Upsert the report into Supabase gate_reports (no-op if not configured)."""
    url = supabase_url or os.environ.get("SUPABASE_URL")
    key = supabase_key or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("Supabase not configured — skipping publish.")
        return
    row = {k: report[k] for k in ("repo_full", "provider", "head_sha", "score", "grade",
                                  "blocking_count", "advisory_count", "generated_at")}
    row["report"] = report
    req = urllib.request.Request(
        f"{url}/rest/v1/gate_reports", data=json.dumps([row]).encode(), method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "Prefer": "resolution=merge-duplicates,return=minimal"})
    with urllib.request.urlopen(req, timeout=20) as r:
        print(f"published to Supabase: HTTP {r.status}")


def main():
    src = os.environ.get("SRC_DIR", "/src")
    report = run_gate(src, os.environ.get("REPO_FULL", ""), os.environ.get("HEAD_SHA", ""),
                      os.environ.get("PROVIDER", "github"), os.environ.get("GATE_VERSION", "dev"))
    print(f"gate: grade {report['grade']} ({report['score']}/100) — "
          f"{report['blocking_count']} blocking, {report['advisory_count']} advisory · jobs {report['jobs']}")
    publish(report)
    print("Security gate OPEN ✅" if is_open(report) else "Security gate BLOCKED ⛔")
    sys.exit(0 if is_open(report) else 1)


if __name__ == "__main__":
    main()
