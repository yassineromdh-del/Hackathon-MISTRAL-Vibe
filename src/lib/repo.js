import { REPO_OWNER, REPO_NAME } from './constants'

// The monitored repo is switchable at runtime: any project carrying the
// security-gate workflow can be watched from this same dashboard.
const STORAGE_KEY = 'gate-dashboard.repo'

export function getRepo() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved?.includes('/')) {
      const [owner, name] = saved.split('/')
      if (owner && name) return { owner, name, full: `${owner}/${name}` }
    }
  } catch { /* storage unavailable — fall through to default */ }
  return { owner: REPO_OWNER, name: REPO_NAME, full: `${REPO_OWNER}/${REPO_NAME}` }
}

export function setRepo(full) {
  const cleaned = full.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(cleaned)) return false
  try { localStorage.setItem(STORAGE_KEY, cleaned) } catch { /* ignore */ }
  return true
}
