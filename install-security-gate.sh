#!/usr/bin/env bash
#
# install-security-gate.sh — drop the stack-agnostic Security Gate into any repo.
#
# The gate (Semgrep SAST + Gitleaks secrets + Trivy dependencies) is language
# independent: Semgrep auto-selects rules per language, Gitleaks scans git
# history, Trivy detects every ecosystem's lockfiles. No config files are
# required — repo-local .semgrep.yml / .gitleaks.toml are used only if present.
#
# The workflow is embedded below, so this script is fully self-contained: it
# needs neither this repository nor network access to the source repo to run.
#
# Usage:
#   ./install-security-gate.sh                 # install into the current git repo
#   ./install-security-gate.sh owner/repo      # install into ONE remote repo (GitHub API)
#   ./install-security-gate.sh --org ORG       # install into EVERY repo of an org/user
#
# Options:
#   --org ORG        install into all non-archived repos of the org/user (bulk)
#   --dry-run        (remote/org) list what WOULD change, write nothing
#   --include-forks  (org) also target forks (skipped by default)
#   --with-configs   also write starter .semgrep.yml, .gitleaks.toml, security/waivers.json
#   --branch NAME    target branch (default: repo default branch, else 'main')
#   --no-push        local mode only: commit but do not push
#   --force          overwrite an existing workflow file
#   -h, --help       show this help
#
# Auth (remote/org modes): set a token with repo scope in the environment:
#   export GITHUB_TOKEN=ghp_xxx      # or GH_TOKEN
#
set -euo pipefail

WORKFLOW_PATH=".github/workflows/security-gate.yml"
API="https://api.github.com"
TARGET=""
ORG=""
WITH_CONFIGS=0
NO_PUSH=0
FORCE=0
DRY=0
INCLUDE_FORKS=0
BRANCH=""
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"

die() { echo "error: $*" >&2; exit 1; }
info() { echo "→ $*"; }

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --org) shift; ORG="${1:-}"; [ -n "$ORG" ] || die "--org needs a value" ;;
    --dry-run) DRY=1 ;;
    --include-forks) INCLUDE_FORKS=1 ;;
    --with-configs) WITH_CONFIGS=1 ;;
    --no-push) NO_PUSH=1 ;;
    --force) FORCE=1 ;;
    --branch) shift; BRANCH="${1:-}"; [ -n "$BRANCH" ] || die "--branch needs a value" ;;
    -h|--help) usage ;;
    -*) die "unknown option: $1" ;;
    *) [ -z "$TARGET" ] || die "unexpected argument: $1"; TARGET="$1" ;;
  esac
  shift
done

b64() { base64 -w0 "$1" 2>/dev/null || base64 "$1" | tr -d '\n'; }

# --- GitHub REST API over curl (no gh dependency) ---------------------------
api() {
  # api METHOD PATH [json-body-file]  → echoes response body, sets API_CODE
  local method="$1" path="$2" body="${3:-}"
  local hdr=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
  local out
  if [ -n "$body" ]; then
    out="$(curl -sS -w '\n%{http_code}' -X "$method" "${hdr[@]}" --data-binary @"$body" "$API$path")"
  else
    out="$(curl -sS -w '\n%{http_code}' -X "$method" "${hdr[@]}" "$API$path")"
  fi
  API_CODE="${out##*$'\n'}"
  printf '%s' "${out%$'\n'*}"
}

# --- Embedded, stack-agnostic workflow -------------------------------------
emit_workflow() {
  cat > "$1" <<'SECURITY_GATE_YAML_EOF'
name: Security Gate

# Stack-agnostic security gate — installed by install-security-gate.sh.
# Runs on every push/PR: Semgrep (SAST) + Gitleaks (secrets) + Trivy (deps).
# Publishes a machine-readable report + score history to the gate-reports
# branch, consumed by the Zero-to-Prod dashboard.

on:
  push:
    branches: [main, master, develop]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  semgrep:
    name: Semgrep SAST
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep:latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
      - name: Run Semgrep (full scan, JSON report)
        run: |
          CONFIGS="--config auto"
          [ -f .semgrep.yml ] && CONFIGS="$CONFIGS --config .semgrep.yml"
          semgrep scan $CONFIGS --json --output semgrep-results.json . || true
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        if: always()
        with:
          name: semgrep-results
          path: semgrep-results.json
          retention-days: 7
      - name: Gate on ERROR findings
        run: |
          python3 - <<'PYEOF'
          import json, sys
          d = json.load(open('semgrep-results.json'))
          errors = [r for r in d.get('results', []) if r.get('extra', {}).get('severity') == 'ERROR']
          for r in errors:
              print(f"::error file={r['path']},line={r['start']['line']}::{r['check_id']}")
          print(f"{len(errors)} blocking finding(s), {len(d.get('results', []))} total")
          sys.exit(1 if errors else 0)
          PYEOF

  gitleaks:
    name: Gitleaks Secrets Detection
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
        with:
          fetch-depth: 0
      - name: Run Gitleaks (current branch history, redacted)
        run: |
          curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz -o gitleaks.tgz
          tar xzf gitleaks.tgz gitleaks
          CFG=""
          [ -f .gitleaks.toml ] && CFG="--config .gitleaks.toml"
          ./gitleaks git $CFG \
            --log-opts="--full-history HEAD" \
            --report-format json --report-path gitleaks-results.json \
            --redact --exit-code 1 .
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        if: always()
        with:
          name: gitleaks-results
          path: gitleaks-results.json
          retention-days: 7

  trivy:
    name: Trivy Dependency Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
      - name: Run Trivy (fail on HIGH/CRITICAL)
        uses: aquasecurity/trivy-action@a9c7b0f06e461e9d4b4d1711f154ee024b8d7ab8 # v0.36.0
        with:
          scan-type: fs
          scan-ref: .
          exit-code: 1
          ignore-unfixed: false
          severity: HIGH,CRITICAL
          format: json
          output: trivy-results.json
      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        if: always()
        with:
          name: trivy-results
          path: trivy-results.json
          retention-days: 7

  security-gate:
    name: Security Gate Decision
    needs: [semgrep, gitleaks, trivy]
    if: always()
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4
        continue-on-error: true
        with:
          path: artifacts
      - name: Build gate report + score history
        env:
          SEMGREP_RESULT: ${{ needs.semgrep.result }}
          GITLEAKS_RESULT: ${{ needs.gitleaks.result }}
          TRIVY_RESULT: ${{ needs.trivy.result }}
          PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          python3 - <<'PYEOF'
          import json, os, glob, datetime, urllib.request

          def load(pattern):
              for p in glob.glob(pattern):
                  try: return json.load(open(p))
                  except Exception: pass
              return None

          semgrep = load('artifacts/semgrep-results/semgrep-results.json')
          trivy = load('artifacts/trivy-results/trivy-results.json')
          gitleaks = load('artifacts/gitleaks-results/gitleaks-results.json')
          waivers = load('security/waivers.json') or []

          findings = []
          for r in (semgrep or {}).get('results', []):
              sev = r.get('extra', {}).get('severity')
              findings.append({'severity': sev, 'blocking': sev == 'ERROR',
                               'rule': r.get('check_id'), 'file': r.get('path'),
                               'line': r.get('start', {}).get('line'),
                               'message': (r.get('extra', {}).get('message') or '')[:300],
                               'remediation': f"See https://semgrep.dev/r/{r.get('check_id')}"})

          vulns = []
          for res in (trivy or {}).get('Results') or []:
              for v in res.get('Vulnerabilities') or []:
                  fixed = v.get('FixedVersion'); pkg = v.get('PkgName')
                  vulns.append({'severity': v.get('Severity'),
                                'blocking': v.get('Severity') in ('HIGH', 'CRITICAL'),
                                'id': v.get('VulnerabilityID'), 'package': pkg,
                                'installed': v.get('InstalledVersion'), 'fixed': fixed,
                                'title': (v.get('Title') or '')[:200],
                                'remediation': (f"Upgrade {pkg} to {fixed}." if fixed
                                                else f"No fix yet for {pkg} — watch the advisory.")})

          leaks = []
          for l in gitleaks or []:
              leaks.append({'severity': 'CRITICAL', 'blocking': True, 'rule': l.get('RuleID'),
                            'file': l.get('File'), 'line': l.get('StartLine'),
                            'description': (l.get('Description') or '')[:200],
                            'commit': (l.get('Commit') or '')[:7],
                            'remediation': "Rotate the secret, move it to an env var, purge it from git history."})

          def weight(sev):
              return {'CRITICAL': 40, 'ERROR': 40, 'HIGH': 20, 'MEDIUM': 5,
                      'WARNING': 5, 'LOW': 1, 'INFO': 1}.get(sev or '', 5)
          penalty = sum(weight(f['severity']) for f in findings) \
              + sum(weight(v['severity']) for v in vulns) \
              + sum(weight(l['severity']) for l in leaks) + 2 * len(waivers)
          score = max(0, 100 - penalty)
          grade = next(g for g, t in [('A+', 95), ('A', 85), ('B', 70), ('C', 50), ('D', 30), ('F', -1)] if score >= t)

          head_sha = os.environ.get('PR_HEAD_SHA') or os.environ.get('GITHUB_SHA')
          report = {'score': score, 'grade': grade, 'sha': os.environ.get('GITHUB_SHA'),
                    'head_sha': head_sha, 'run_id': os.environ.get('GITHUB_RUN_ID'),
                    'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'jobs': {'semgrep': os.environ['SEMGREP_RESULT'],
                             'gitleaks': os.environ['GITLEAKS_RESULT'],
                             'trivy': os.environ['TRIVY_RESULT']},
                    'semgrep_findings': findings, 'trivy_vulnerabilities': vulns,
                    'gitleaks_leaks': leaks, 'waivers': waivers}
          os.makedirs('report', exist_ok=True)
          json.dump(report, open('report/latest.json', 'w'), indent=1)
          print(f"report: grade {grade} ({score}/100)")

          blocking_count = sum(1 for f in findings if f['blocking']) \
              + sum(1 for v in vulns if v['blocking']) + sum(1 for l in leaks if l['blocking'])
          advisory_count = (len(findings) + len(vulns) + len(leaks)) - blocking_count

          def load_history():
              repo = os.environ.get('GITHUB_REPOSITORY'); token = os.environ.get('GITHUB_TOKEN')
              url = f"https://api.github.com/repos/{repo}/contents/history.json?ref=gate-reports"
              req = urllib.request.Request(url, headers={'Accept': 'application/vnd.github.raw+json',
                                                         'Authorization': f'Bearer {token}',
                                                         'User-Agent': 'security-gate'})
              try:
                  with urllib.request.urlopen(req, timeout=15) as r:  # nosemgrep
                      data = json.loads(r.read().decode())
                      return data if isinstance(data, list) else []
              except Exception as e:
                  print(f"history: starting fresh ({e})"); return []

          entry = {'head_sha': head_sha, 'sha': report['sha'], 'score': score, 'grade': grade,
                   'generated_at': report['generated_at'], 'jobs': report['jobs'],
                   'blocking_count': blocking_count, 'advisory_count': advisory_count}
          history = [h for h in load_history() if h.get('head_sha') != head_sha]
          history.append(entry); history = history[-50:]
          json.dump(history, open('report/history.json', 'w'), indent=1)

          summary = os.environ.get('GITHUB_STEP_SUMMARY')
          if summary:
              ok = all(v == 'success' for v in report['jobs'].values())
              tone = {'A+': '🟢', 'A': '🟢', 'B': '🟡', 'C': '🟠', 'D': '🔴', 'F': '🔴'}[grade]
              with open(summary, 'a') as s:
                  s.write(f"# 🛡️ Security Gate — {'OPEN ✅' if ok else 'BLOCKED ⛔'}\n\n")
                  s.write(f"## {tone} Vibe Security Score: **{grade}** ({score}/100)\n\n")
                  s.write(f"{blocking_count} blocking · {advisory_count} advisory · {len(waivers)} waiver(s)\n\n")
                  s.write("| Scan | Verdict |\n|---|---|\n")
                  for k, v in report['jobs'].items():
                      s.write(f"| {k.capitalize()} | {'✅' if v == 'success' else '❌'} {v} |\n")
          PYEOF
      - name: Publish report to gate-reports branch
        run: |
          cd report
          git init -q -b gate-reports
          git config user.name "security-gate[bot]"
          git config user.email "actions@users.noreply.github.com"
          git add latest.json history.json
          git commit -q -m "gate report for ${GITHUB_SHA::7}"
          git push --force -q \
            "https://x-access-token:${{ secrets.GITHUB_TOKEN }}@github.com/${GITHUB_REPOSITORY}.git" \
            gate-reports
      - name: Evaluate gate
        run: |
          echo "Semgrep: ${{ needs.semgrep.result }} | Gitleaks: ${{ needs.gitleaks.result }} | Trivy: ${{ needs.trivy.result }}"
          if [ "${{ needs.semgrep.result }}" != "success" ] || \
             [ "${{ needs.gitleaks.result }}" != "success" ] || \
             [ "${{ needs.trivy.result }}" != "success" ]; then
            echo "::error::Security gate BLOCKED — at least one scan failed"; exit 1
          fi
          echo "All security gates passed — safe to merge"
SECURITY_GATE_YAML_EOF
}

emit_semgrep_config() {
  cat > "$1" <<'SEMGREP_EOF'
rules:
  - id: no-hardcoded-secret-assignment
    languages: [generic]
    severity: ERROR
    message: Possible hardcoded secret — move it to an environment variable and rotate it.
    pattern-regex: (?i)(api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]
SEMGREP_EOF
}

emit_gitleaks_config() {
  cat > "$1" <<'GITLEAKS_EOF'
title = "gitleaks config"
[extend]
useDefault = true

[allowlist]
description = "Vendored / generated files with no real secrets"
paths = [
  '''node_modules/''',
  '''dist/''',
  '''(.*?)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)''',
]
GITLEAKS_EOF
}

emit_waivers() {
  cat > "$1" <<'WAIVERS_EOF'
[]
WAIVERS_EOF
}

# --- Local install ----------------------------------------------------------
install_local() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository (cd into your project, or pass owner/repo)"
  local root; root="$(git rev-parse --show-toplevel)"
  info "installing into local repo: $root"

  if [ -f "$root/$WORKFLOW_PATH" ] && [ "$FORCE" -eq 0 ]; then
    die "$WORKFLOW_PATH already exists — re-run with --force to overwrite"
  fi
  mkdir -p "$root/.github/workflows"
  emit_workflow "$root/$WORKFLOW_PATH"
  info "wrote $WORKFLOW_PATH"

  local added=("$WORKFLOW_PATH")
  if [ "$WITH_CONFIGS" -eq 1 ]; then
    [ -f "$root/.semgrep.yml" ]   || { emit_semgrep_config "$root/.semgrep.yml";     added+=(".semgrep.yml"); info "wrote .semgrep.yml"; }
    [ -f "$root/.gitleaks.toml" ] || { emit_gitleaks_config "$root/.gitleaks.toml";   added+=(".gitleaks.toml"); info "wrote .gitleaks.toml"; }
    mkdir -p "$root/security"
    [ -f "$root/security/waivers.json" ] || { emit_waivers "$root/security/waivers.json"; added+=("security/waivers.json"); info "wrote security/waivers.json"; }
  fi

  ( cd "$root" && git add "${added[@]}" && git commit -q -m "ci: add stack-agnostic security gate" )
  info "committed."
  if [ "$NO_PUSH" -eq 1 ]; then
    info "done (--no-push): commit created, push it yourself to trigger the gate."
  else
    ( cd "$root" && git push )
    info "pushed — the gate will run on this push. Watch it under the repo's Actions tab."
  fi
}

# --- Remote install (GitHub REST API) ---------------------------------------
# Create/update one file in a repo via the contents API. Honors --dry-run.
put_file() {
  local repo="$1" path="$2" file="$3" branch="$4" sha bodyfile resp
  if [ "$DRY" -eq 1 ]; then info "   [dry-run] would write $path"; return 0; fi
  api GET "/repos/$repo/contents/$path?ref=$branch" >/tmp/_gate_get.$$ 2>/dev/null || true
  sha="$(python3 -c "import json,sys;print(json.load(open('/tmp/_gate_get.$$')).get('sha',''))" 2>/dev/null || true)"
  rm -f /tmp/_gate_get.$$
  bodyfile="$(mktemp)"
  python3 - "$path" "$(b64 "$file")" "$branch" "$sha" > "$bodyfile" <<'PY'
import json, sys
path, content, branch, sha = sys.argv[1:5]
body = {"message": f"ci: add {path} (security gate)", "content": content, "branch": branch}
if sha: body["sha"] = sha
print(json.dumps(body))
PY
  resp="$(api PUT "/repos/$repo/contents/$path" "$bodyfile")"
  rm -f "$bodyfile"
  case "$API_CODE" in
    200|201) return 0 ;;
    *) echo "     ! API $API_CODE writing $path: $(printf '%s' "$resp" | head -c 200)" >&2; return 1 ;;
  esac
}

repo_default_branch() {
  api GET "/repos/$1" >/tmp/_gate_repo.$$ 2>/dev/null || true
  python3 -c "import json;print(json.load(open('/tmp/_gate_repo.$$')).get('default_branch','main'))" 2>/dev/null || echo main
  rm -f /tmp/_gate_repo.$$
}

workflow_exists() {
  api GET "/repos/$1/contents/$WORKFLOW_PATH?ref=$2" >/dev/null 2>&1
  [ "$API_CODE" = "200" ]
}

install_one_remote() {
  local repo="$1" branch="$2"
  local tmp; tmp="$(mktemp -d)"
  emit_workflow "$tmp/wf.yml"
  put_file "$repo" "$WORKFLOW_PATH" "$tmp/wf.yml" "$branch" || { rm -rf "$tmp"; return 1; }
  if [ "$WITH_CONFIGS" -eq 1 ]; then
    emit_semgrep_config "$tmp/s.yml";   put_file "$repo" ".semgrep.yml" "$tmp/s.yml" "$branch" || true
    emit_gitleaks_config "$tmp/g.toml"; put_file "$repo" ".gitleaks.toml" "$tmp/g.toml" "$branch" || true
    emit_waivers "$tmp/w.json";         put_file "$repo" "security/waivers.json" "$tmp/w.json" "$branch" || true
  fi
  rm -rf "$tmp"
}

install_remote() {
  [ -n "$TOKEN" ] || die "set GITHUB_TOKEN (repo scope) for remote install"
  [[ "$TARGET" =~ ^[^/]+/[^/]+$ ]] || die "target must be owner/repo (got: $TARGET)"
  local branch="${BRANCH:-$(repo_default_branch "$TARGET")}"
  info "installing into $TARGET (branch $branch)${DRY:+ [dry-run]}"
  if [ "$FORCE" -eq 0 ] && workflow_exists "$TARGET" "$branch"; then
    info "   already has the gate — skipping (use --force to overwrite)"; return 0
  fi
  install_one_remote "$TARGET" "$branch" && info "   ✓ done — the commit triggers the gate under $TARGET → Actions"
}

# List an org/user's repos (paginated) → "full_name<TAB>fork" lines.
list_org_repos() {
  local org="$1" page=1 kind body count
  # try org endpoint first, fall back to user endpoint
  api GET "/orgs/$org/repos?per_page=100&page=1" >/tmp/_gate_probe.$$ 2>/dev/null || true
  [ "$API_CODE" = "200" ] && kind="orgs" || kind="users"
  rm -f /tmp/_gate_probe.$$
  while :; do
    body="$(api GET "/$kind/$org/repos?per_page=100&page=$page&type=all")"
    [ "$API_CODE" = "200" ] || die "cannot list repos for '$org' (API $API_CODE)"
    count="$(printf '%s' "$body" | python3 -c "import json,sys;d=json.load(sys.stdin);print(len(d));[print(r['full_name']+chr(9)+str(r['archived'])+chr(9)+str(r['fork'])) for r in d]" 2>/dev/null | tail -n +1)"
    printf '%s\n' "$count" | grep -q '/' || break
    printf '%s\n' "$count" | tail -n +2
    local n; n="$(printf '%s\n' "$count" | head -1)"
    [ "$n" -lt 100 ] 2>/dev/null && break
    page=$((page+1))
  done
}

install_org() {
  [ -n "$TOKEN" ] || die "set GITHUB_TOKEN (repo scope) for --org install"
  info "listing repos for '$ORG'…"
  local repos; repos="$(list_org_repos "$ORG")"
  local total=0 done=0 skipped=0
  while IFS=$'\t' read -r full archived fork; do
    [ -n "$full" ] || continue
    total=$((total+1))
    if [ "$archived" = "True" ]; then info "· $full — archived, skip"; skipped=$((skipped+1)); continue; fi
    if [ "$fork" = "True" ] && [ "$INCLUDE_FORKS" -eq 0 ]; then info "· $full — fork, skip (use --include-forks)"; skipped=$((skipped+1)); continue; fi
    local branch; branch="$(repo_default_branch "$full")"
    if [ "$FORCE" -eq 0 ] && workflow_exists "$full" "$branch"; then
      info "· $full — already has the gate, skip"; skipped=$((skipped+1)); continue
    fi
    if [ "$DRY" -eq 1 ]; then info "· $full — [dry-run] would install (branch $branch)"; done=$((done+1)); continue; fi
    info "· $full — installing (branch $branch)…"
    install_one_remote "$full" "$branch" && { done=$((done+1)); info "   ✓ done"; } || info "   ! failed"
  done <<< "$repos"
  info "----"
  info "$total repo(s) scanned · $done $([ "$DRY" -eq 1 ] && echo 'to install' || echo 'installed') · $skipped skipped"
  [ "$DRY" -eq 1 ] && info "dry-run only — re-run without --dry-run to apply."
}

# --- Dispatch ---------------------------------------------------------------
if [ -n "$ORG" ]; then
  install_org
elif [ -n "$TARGET" ] && [ "$TARGET" != "." ]; then
  install_remote
else
  install_local
fi
