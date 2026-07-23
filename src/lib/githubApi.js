import { GITHUB_API_BASE, WORKFLOW_FILE, PERMISSION_TO_ROLE, ROLES } from './constants'
import { getRepo } from './repo'

// Token priority: OAuth token from the GitHub login session, then a local
// dev token from .env, then unauthenticated (public repos, 60 req/h).
let sessionToken = null

export function setGithubToken(token) {
  sessionToken = token || null
}

function authHeaders() {
  const token = sessionToken || import.meta.env.VITE_GITHUB_TOKEN
  return {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function ghFetch(path) {
  const res = await fetch(`${GITHUB_API_BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) {
    const error = new Error(`GitHub API ${res.status} on ${path}`)
    error.status = res.status
    throw error
  }
  return res.json()
}

export async function fetchWorkflowRuns(perPage = 20) {
  const data = await ghFetch(
    `/repos/${getRepo().full}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=${perPage}`
  )
  return data.workflow_runs ?? []
}

export async function fetchRunJobs(runId) {
  const data = await ghFetch(`/repos/${getRepo().full}/actions/runs/${runId}/jobs`)
  return data.jobs ?? []
}

// Published by the gate job on the `gate-reports` branch. Read through the
// contents API rather than raw.githubusercontent: same CORS support, but no
// CDN cache (raw lags up to ~5 min behind the branch).
export async function fetchGateReport(repoFull) {
  const full = repoFull || getRepo().full
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${full}/contents/latest.json?ref=gate-reports`,
    { headers: { ...authHeaders(), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }
  )
  if (!res.ok) return null
  return res.json()
}

// Score history published alongside latest.json on the gate-reports branch.
// Returns [] (never null) so callers can map without a guard.
export async function fetchGateHistory() {
  try {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${getRepo().full}/contents/history.json?ref=gate-reports`,
      { headers: { ...authHeaders(), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' }
    )
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

export async function fetchPullRequests(perPage = 20) {
  const data = await ghFetch(
    `/repos/${getRepo().full}/pulls?state=open&sort=updated&direction=desc&per_page=${perPage}`
  )
  return Array.isArray(data) ? data : []
}

export async function fetchUserRole(username) {
  if (!username) return ROLES.GUEST
  try {
    const data = await ghFetch(
      `/repos/${getRepo().full}/collaborators/${username}/permission`
    )
    return PERMISSION_TO_ROLE[data.permission] ?? ROLES.VIEWER
  } catch {
    // 403/404 → not a collaborator (or no token scope): signed-in users are viewers
    return ROLES.VIEWER
  }
}
