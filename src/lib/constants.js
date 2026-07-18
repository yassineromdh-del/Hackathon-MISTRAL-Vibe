export const REPO_OWNER = import.meta.env.VITE_GITHUB_OWNER || 'yassineromdh-del'
export const REPO_NAME = import.meta.env.VITE_GITHUB_REPO || 'Hackathon-MISTRAL-Vibe'
export const GITHUB_API_BASE = 'https://api.github.com'
export const WORKFLOW_FILE = 'security-gate.yml'

export const ROLES = {
  MAINTAINER: 'maintainer',
  CONTRIBUTOR: 'contributor',
  VIEWER: 'viewer',
  GUEST: 'guest',
}

// GitHub collaborator permission → app role
export const PERMISSION_TO_ROLE = {
  admin: ROLES.MAINTAINER,
  maintain: ROLES.MAINTAINER,
  write: ROLES.CONTRIBUTOR,
  push: ROLES.CONTRIBUTOR,
  triage: ROLES.VIEWER,
  read: ROLES.VIEWER,
  pull: ROLES.VIEWER,
  none: ROLES.GUEST,
}
