#!/usr/bin/env bash
#
# install-security-gate.sh — wire any repo to the CENTRAL security gate.
#
# The gate logic (Semgrep + Gitleaks + Trivy + Vibe Security Score) lives in ONE
# versioned container image and one reusable CI definition. This script does NOT
# copy that logic into your repo — it drops a tiny STUB (≈5 lines) that calls the
# central gate. Evolving the gate = bumping the image tag, with zero push to your
# repos. Onboarding a repo = this one small stub (or nothing at all if you enable
# org/group enforcement — see README).
#
# Usage:
#   ./install-security-gate.sh                      # stub into the current git repo
#   ./install-security-gate.sh owner/repo           # stub into ONE remote GitHub repo
#   ./install-security-gate.sh --org ORG            # stub into EVERY repo of a GitHub org/user
#   ./install-security-gate.sh --provider gitlab group/project   # GitLab (via glab)
#
# Options:
#   --provider P     github (default) | gitlab
#   --gate-org ORG   org/group hosting the reusable gate. GitHub: the <ORG>/.github
#                    repo ; GitLab: the <ORG>/ci-templates project. Default: the
#                    target repo's owner (remote) — required in local mode.
#   --gate-ref REF   gate version to pin (default: v1)
#   --org ORG        install into all non-archived repos of a GitHub org/user (bulk)
#   --dry-run        (remote/org) list what WOULD change, write nothing
#   --include-forks  (org) also target forks (skipped by default)
#   --with-configs   also write starter .semgrep.yml, .gitleaks.toml, security/waivers.json
#   --branch NAME    target branch (default: repo default branch, else 'main')
#   --no-push        local mode only: commit but do not push
#   --force          overwrite an existing stub
#   -h, --help       show this help
#
# Auth (remote/org): GitHub → GITHUB_TOKEN/GH_TOKEN (repo+workflow scope).
#                    GitLab → an authenticated `glab` (glab auth login).
#
set -euo pipefail

API="https://api.github.com"
TARGET=""
ORG=""
PROVIDER="github"
GATE_ORG=""
GATE_REF="v1"
WITH_CONFIGS=0
NO_PUSH=0
FORCE=0
DRY=0
INCLUDE_FORKS=0
BRANCH=""
TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
API_BODY="$(mktemp)"                       # fixed path: survives $() subshells
trap 'rm -f "$API_BODY"' EXIT

die() { echo "error: $*" >&2; exit 1; }
info() { echo "→ $*"; }

usage() { sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --provider) shift; PROVIDER="${1:-}"; [ -n "$PROVIDER" ] || die "--provider needs a value" ;;
    --gate-org) shift; GATE_ORG="${1:-}"; [ -n "$GATE_ORG" ] || die "--gate-org needs a value" ;;
    --gate-ref) shift; GATE_REF="${1:-}"; [ -n "$GATE_REF" ] || die "--gate-ref needs a value" ;;
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

case "$PROVIDER" in github|gitlab) ;; *) die "--provider must be github or gitlab (got: $PROVIDER)" ;; esac

# Where the stub lives, per provider.
stub_path() { [ "$PROVIDER" = "gitlab" ] && echo ".gitlab-ci.yml" || echo ".github/workflows/security-gate.yml"; }
WORKFLOW_PATH="$(stub_path)"

# Resolve the org/group hosting the central gate. Remote: default to the
# target's owner; local: must be provided.
gate_org_for() { if [ -n "$GATE_ORG" ]; then echo "$GATE_ORG"; else echo "${1%%/*}"; fi; }

b64() { base64 -w0 "$1" 2>/dev/null || base64 "$1" | tr -d '\n'; }

# --- GitHub REST API over curl (no gh dependency) ---------------------------
api() {
  local method="$1" path="$2" body="${3:-}"
  local hdr=(-H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
  if [ -n "$body" ]; then
    curl -sS -o "$API_BODY" -w '%{http_code}' -X "$method" "${hdr[@]}" --data-binary @"$body" "$API$path"
  else
    curl -sS -o "$API_BODY" -w '%{http_code}' -X "$method" "${hdr[@]}" "$API$path"
  fi
}

# --- The STUB — the ONLY thing written into a repo --------------------------
# emit_stub FILE GATE_ORG : a tiny caller that delegates to the central gate.
emit_stub() {
  local file="$1" org="$2"
  if [ "$PROVIDER" = "gitlab" ]; then
    cat > "$file" <<GITLAB_STUB_EOF
# Security gate — calls the central template. The gate logic is NOT here.
# Bump the template ref to roll out changes; nothing to re-push per project.
include:
  - project: '$org/ci-templates'
    file: 'gate.gitlab-ci.yml'
    ref: $GATE_REF
GITLAB_STUB_EOF
  else
    cat > "$file" <<GITHUB_STUB_EOF
# Security gate — calls the org's reusable workflow. The gate logic is NOT here.
# Bump gate_tag / the ref to roll out changes; nothing to re-push per repo.
name: Security Gate

on:
  push:
    branches: [main, master, develop]
  pull_request:
  workflow_dispatch:

jobs:
  gate:
    uses: $org/.github/.github/workflows/gate-reusable.yml@$GATE_REF
    secrets: inherit
GITHUB_STUB_EOF
  fi
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
  [ -n "$GATE_ORG" ] || die "local mode needs --gate-org ORG (the org/group hosting the central gate)"
  info "wiring local repo to central gate ($PROVIDER, $GATE_ORG@$GATE_REF): $root"

  if [ -f "$root/$WORKFLOW_PATH" ] && [ "$FORCE" -eq 0 ]; then
    die "$WORKFLOW_PATH already exists — re-run with --force to overwrite"
  fi
  mkdir -p "$(dirname "$root/$WORKFLOW_PATH")"
  emit_stub "$root/$WORKFLOW_PATH" "$GATE_ORG"
  info "wrote $WORKFLOW_PATH (stub)"

  local added=("$WORKFLOW_PATH")
  if [ "$WITH_CONFIGS" -eq 1 ]; then
    [ -f "$root/.semgrep.yml" ]   || { emit_semgrep_config "$root/.semgrep.yml";     added+=(".semgrep.yml"); info "wrote .semgrep.yml"; }
    [ -f "$root/.gitleaks.toml" ] || { emit_gitleaks_config "$root/.gitleaks.toml";   added+=(".gitleaks.toml"); info "wrote .gitleaks.toml"; }
    mkdir -p "$root/security"
    [ -f "$root/security/waivers.json" ] || { emit_waivers "$root/security/waivers.json"; added+=("security/waivers.json"); info "wrote security/waivers.json"; }
  fi

  ( cd "$root" && git add "${added[@]}" && git commit -q -m "ci: wire repo to central security gate" )
  info "committed."
  if [ "$NO_PUSH" -eq 1 ]; then
    info "done (--no-push): commit created, push it yourself to trigger the gate."
  else
    ( cd "$root" && git push )
    info "pushed — the gate will run on this push."
  fi
}

# --- Remote install: GitHub (contents API) ----------------------------------
put_file_github() {
  local repo="$1" path="$2" file="$3" branch="$4" sha bodyfile code
  if [ "$DRY" -eq 1 ]; then info "   [dry-run] would write $path"; return 0; fi
  if [ "$(api GET "/repos/$repo/contents/$path?ref=$branch")" = "200" ]; then
    sha="$(python3 -c "import json;print(json.load(open('$API_BODY')).get('sha',''))" 2>/dev/null || true)"
  else
    sha=""
  fi
  bodyfile="$(mktemp)"
  python3 - "$path" "$(b64 "$file")" "$branch" "$sha" > "$bodyfile" <<'PY'
import json, sys
path, content, branch, sha = sys.argv[1:5]
body = {"message": f"ci: wire {path} to central security gate", "content": content, "branch": branch}
if sha: body["sha"] = sha
print(json.dumps(body))
PY
  code="$(api PUT "/repos/$repo/contents/$path" "$bodyfile")"
  rm -f "$bodyfile"
  case "$code" in
    200|201) return 0 ;;
    *) echo "     ! API $code writing $path: $(head -c 200 "$API_BODY")" >&2; return 1 ;;
  esac
}

# --- Remote install: GitLab (via glab) --------------------------------------
put_file_gitlab() {
  local repo="$1" path="$2" file="$3" branch="$4" enc_repo enc_path content
  command -v glab >/dev/null 2>&1 || die "glab CLI required for GitLab remote install (glab auth login)"
  if [ "$DRY" -eq 1 ]; then info "   [dry-run] would write $path to $repo"; return 0; fi
  enc_repo="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$repo")"
  enc_path="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$path")"
  content="$(b64 "$file")"
  # Update first, create on 400/404. GitLab Files API takes base64 content.
  glab api --method PUT "projects/$enc_repo/repository/files/$enc_path" \
      -f branch="$branch" -f encoding=base64 -f content="$content" \
      -f commit_message="ci: wire $path to central security gate" >/dev/null 2>&1 \
    || glab api --method POST "projects/$enc_repo/repository/files/$enc_path" \
      -f branch="$branch" -f encoding=base64 -f content="$content" \
      -f commit_message="ci: wire $path to central security gate" >/dev/null \
    || { echo "     ! glab failed writing $path" >&2; return 1; }
}

put_file() { if [ "$PROVIDER" = "gitlab" ]; then put_file_gitlab "$@"; else put_file_github "$@"; fi; }

repo_default_branch() {
  if [ "$(api GET "/repos/$1")" = "200" ]; then
    python3 -c "import json;print(json.load(open('$API_BODY')).get('default_branch','main'))" 2>/dev/null || echo main
  else
    echo main
  fi
}

workflow_exists() { [ "$(api GET "/repos/$1/contents/$WORKFLOW_PATH?ref=$2")" = "200" ]; }

# Writing .github/workflows/* over the API requires the 'workflow' scope.
check_workflow_scope() {
  local scopes
  scopes="$(curl -sS -I -H "Authorization: Bearer $TOKEN" "$API/user" 2>/dev/null \
            | tr -d '\r' | awk -F': ' 'tolower($1)=="x-oauth-scopes"{print $2}')"
  if [ -n "$scopes" ] && ! printf '%s' "$scopes" | grep -qw workflow; then
    die "token is missing the 'workflow' scope (has: ${scopes:-none}). Regenerate a classic token with 'repo'+'workflow'."
  fi
}

install_one_remote() {
  local repo="$1" branch="$2" org; org="$(gate_org_for "$repo")"
  local tmp; tmp="$(mktemp -d)"
  emit_stub "$tmp/stub" "$org"
  put_file "$repo" "$WORKFLOW_PATH" "$tmp/stub" "$branch" || { rm -rf "$tmp"; return 1; }
  if [ "$WITH_CONFIGS" -eq 1 ]; then
    emit_semgrep_config "$tmp/s.yml";   put_file "$repo" ".semgrep.yml" "$tmp/s.yml" "$branch" || true
    emit_gitleaks_config "$tmp/g.toml"; put_file "$repo" ".gitleaks.toml" "$tmp/g.toml" "$branch" || true
    emit_waivers "$tmp/w.json";         put_file "$repo" "security/waivers.json" "$tmp/w.json" "$branch" || true
  fi
  rm -rf "$tmp"
}

install_remote() {
  [[ "$TARGET" =~ ^[^/]+/[^/]+$ ]] || die "target must be owner/repo (got: $TARGET)"
  if [ "$PROVIDER" = "github" ]; then
    [ -n "$TOKEN" ] || die "set GITHUB_TOKEN (repo+workflow scope) for remote install"
    [ "$DRY" -eq 1 ] || check_workflow_scope
    local branch="${BRANCH:-$(repo_default_branch "$TARGET")}"
  else
    local branch="${BRANCH:-main}"
  fi
  info "wiring $TARGET to central gate ($PROVIDER, $(gate_org_for "$TARGET")@$GATE_REF, branch $branch)${DRY:+ [dry-run]}"
  if [ "$PROVIDER" = "github" ] && [ "$FORCE" -eq 0 ] && workflow_exists "$TARGET" "$branch"; then
    info "   already wired — skipping (use --force)"; return 0
  fi
  install_one_remote "$TARGET" "$branch" && info "   ✓ done — the commit triggers the central gate"
}

# List a GitHub org/user's repos (paginated) → "full_name<TAB>archived<TAB>fork".
list_org_repos() {
  local org="$1" page=1 kind code n
  if [ "$(api GET "/orgs/$org/repos?per_page=1")" = "200" ]; then kind="orgs"; else kind="users"; fi
  while :; do
    code="$(api GET "/$kind/$org/repos?per_page=100&page=$page&type=all")"
    [ "$code" = "200" ] || die "cannot list repos for '$org' (API $code)"
    n="$(python3 -c "import json;print(len(json.load(open('$API_BODY'))))" 2>/dev/null || echo 0)"
    [ "$n" -gt 0 ] || break
    python3 -c "import json;[print(r['full_name']+chr(9)+str(r['archived'])+chr(9)+str(r['fork'])) for r in json.load(open('$API_BODY'))]"
    [ "$n" -lt 100 ] && break
    page=$((page+1))
  done
}

install_org() {
  [ "$PROVIDER" = "github" ] || die "--org bulk mode is GitHub-only for now. For GitLab, prefer a group-level Scan Execution Policy (see README), or run per project."
  [ -n "$TOKEN" ] || die "set GITHUB_TOKEN for --org install"
  [ "$DRY" -eq 1 ] || check_workflow_scope
  info "listing repos for '$ORG'…"
  local repos; repos="$(list_org_repos "$ORG")"
  local total=0 done=0 skipped=0
  while IFS=$'\t' read -r full archived fork; do
    [ -n "$full" ] || continue
    total=$((total+1))
    if [ "$archived" = "True" ]; then info "· $full — archived, skip"; skipped=$((skipped+1)); continue; fi
    if [ "$fork" = "True" ] && [ "$INCLUDE_FORKS" -eq 0 ]; then info "· $full — fork, skip"; skipped=$((skipped+1)); continue; fi
    local branch; branch="$(repo_default_branch "$full")"
    if [ "$FORCE" -eq 0 ] && workflow_exists "$full" "$branch"; then
      info "· $full — already wired, skip"; skipped=$((skipped+1)); continue
    fi
    if [ "$DRY" -eq 1 ]; then info "· $full — [dry-run] would wire (branch $branch)"; done=$((done+1)); continue; fi
    info "· $full — wiring (branch $branch)…"
    install_one_remote "$full" "$branch" && { done=$((done+1)); info "   ✓ done"; } || info "   ! failed"
  done <<< "$repos"
  info "----"
  info "$total repo(s) scanned · $done $([ "$DRY" -eq 1 ] && echo 'to wire' || echo 'wired') · $skipped skipped"
  [ "$DRY" -eq 1 ] && info "dry-run only — re-run without --dry-run to apply."
  return 0
}

# --- Dispatch ---------------------------------------------------------------
if [ -n "$ORG" ]; then
  install_org
elif [ -n "$TARGET" ] && [ "$TARGET" != "." ]; then
  install_remote
else
  install_local
fi
