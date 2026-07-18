/**
 * GitHub API service to check user roles in the repository
 * Uses GitHub REST API to verify if a user is a maintainer
 */

import { REPO_OWNER, REPO_NAME, GITHUB_API_BASE, ROLES } from './constants';

const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;

/**
 * Check if a user is a maintainer of the repository
 * GitHub API: GET /repos/{owner}/{repo}/collaborators/{username}
 * Returns the user's permission level
 * @param {string} username - GitHub username to check
 * @returns {Promise<string>} - Role: 'maintainer', 'write', 'read', or 'none'
 */
export async function checkUserRepositoryRole(username) {
  if (!username) {
    console.warn('No username provided to check GitHub role');
    return ROLES.GUEST;
  }

  try {
    const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/collaborators/${username}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': GITHUB_TOKEN ? `Bearer ${GITHUB_TOKEN}` : '',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    // If user is not a collaborator, they won't be found
    if (response.status === 404) {
      console.log(`User ${username} is not a collaborator of ${REPO_OWNER}/${REPO_NAME}`);
      return ROLES.GUEST;
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('GitHub API error:', response.status, errorData);
      // Fallback: try to get repository permissions via /user/repos
      return await checkUserRepoPermissions(username);
    }

    const data = await response.json();
    const permissions = data.permissions || {};
    
    // Map GitHub permissions to our roles
    if (permissions.admin) {
      return ROLES.MAINTAINER;
    }
    if (permissions.maintain) {
      return ROLES.MAINTAINER;
    }
    if (permissions.push) {
      return ROLES.CONTRIBUTOR;
    }
    if (permissions.pull) {
      return ROLES.VIEWER;
    }
    
    return ROLES.GUEST;
  } catch (error) {
    console.error('Error checking GitHub role:', error);
    // Fallback: try alternative method
    return await checkUserRepoPermissions(username);
  }
}

/**
 * Alternative method: Check if user has access to the repository
 * Uses /user/repos endpoint to check if authenticated user can access the repo
 * @param {string} username - GitHub username
 * @returns {Promise<string>} - Role
 */
async function checkUserRepoPermissions(username) {
  try {
    // Check if the authenticated user (using the token) has access
    // This is a fallback when we can't check specific collaborator
    const url = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': GITHUB_TOKEN ? `Bearer ${GITHUB_TOKEN}` : '',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const permissions = data.permissions || {};
      
      if (permissions.admin || permissions.maintain) {
        return ROLES.MAINTAINER;
      }
      if (permissions.push) {
        return ROLES.CONTRIBUTOR;
      }
      if (permissions.pull) {
        return ROLES.VIEWER;
      }
    }
    
    return ROLES.GUEST;
  } catch (error) {
    console.error('Fallback GitHub check failed:', error);
    // Default to guest if we can't verify
    return ROLES.GUEST;
  }
}

/**
 * Get GitHub username from Supabase user metadata
 * @param {object} user - Supabase user object
 * @returns {string|null} - GitHub username or null
 */
export function getGitHubUsername(user) {
  if (!user) return null;
  
  // Check user_metadata from GitHub OAuth
  const userMetadata = user.user_metadata || {};
  const userName = userMetadata.user_name || userMetadata.login || userMetadata.name;
  
  if (userName) {
    return userName;
  }
  
  // Check identités (for GitHub provider)
  const identities = user.identities || [];
  const githubIdentity = identities.find(id => id.provider === 'github');
  if (githubIdentity) {
    return githubIdentity.identity_data?.user_name || githubIdentity.identity_data?.login;
  }
  
  return null;
}

/**
 * Full role resolution: Get the user's role based on GitHub maintainer status
 * @param {object} user - Supabase user object
 * @returns {Promise<{role: string, isMaintainer: boolean}>}
 */
export async function resolveUserRole(user) {
  const username = getGitHubUsername(user);
  
  if (!username) {
    console.warn('Cannot determine GitHub username from user:', user);
    return { role: ROLES.GUEST, isMaintainer: false };
  }
  
  console.log(`Checking GitHub role for user: ${username}`);
  const role = await checkUserRepositoryRole(username);
  
  return {
    role,
    isMaintainer: role === ROLES.MAINTAINER
  };
}
