import { GITHUB_API_BASE, REPO_OWNER, REPO_NAME, WORKFLOW_FILE, PERMISSION_TO_ROLE, ROLES } from './constants'

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
    `/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=${perPage}`
  )
  return data.workflow_runs ?? []
}

export async function fetchRunJobs(runId) {
  const data = await ghFetch(`/repos/${REPO_OWNER}/${REPO_NAME}/actions/runs/${runId}/jobs`)
  return data.jobs ?? []
}

// Published by the gate job on the `gate-reports` branch; raw.githubusercontent
// sends CORS headers, unlike the Actions artifact download endpoint.
export async function fetchGateReport() {
  const res = await fetch(
    `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/gate-reports/latest.json?t=${Date.now()}`,
    { cache: 'no-store' }
  )
  if (!res.ok) return null
  return res.json()
}

export async function fetchUserRole(username) {
  if (!username) return ROLES.GUEST
  try {
    const data = await ghFetch(
      `/repos/${REPO_OWNER}/${REPO_NAME}/collaborators/${username}/permission`
    )
    return PERMISSION_TO_ROLE[data.permission] ?? ROLES.VIEWER
  } catch {
    // 403/404 → not a collaborator (or no token scope): signed-in users are viewers
    return ROLES.VIEWER
  }
}
