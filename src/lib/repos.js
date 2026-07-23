import { getRepo } from './repo'

// The list of repos shown in the portfolio view. Kept separate from repo.js,
// which tracks the single *active* repo for the detail dashboard.
const STORAGE_KEY = 'gate-dashboard.repos'

const clean = (full) =>
  full.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/+$/, '')

const isValid = (full) => /^[\w.-]+\/[\w.-]+$/.test(full)

export function getRepos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length) return arr.filter(isValid)
    }
  } catch { /* fall through */ }
  // Seed from the active/default single repo so the portfolio is never empty.
  return [getRepo().full]
}

function save(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

export function addRepo(full) {
  const cleaned = clean(full)
  if (!isValid(cleaned)) return false
  const list = getRepos()
  if (!list.includes(cleaned)) { list.push(cleaned); save(list) }
  return true
}

export function removeRepo(full) {
  const list = getRepos().filter((r) => r !== full)
  save(list.length ? list : [getRepo().full])
  return getRepos()
}
