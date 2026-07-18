/**
 * Role service for managing user roles in Supabase
 * Handles fetching, storing, and checking user permissions
 */

import { supabase } from './supabaseClient';
import { TABLES, ROLES } from './constants';
import { getGitHubUsername, resolveUserRole } from './githubApi';

/**
 * Get or create user role record in Supabase
 * @param {object} user - Supabase user object
 * @returns {Promise<{role: string, isMaintainer: boolean}>}
 */
export async function getOrCreateUserRole(user) {
  if (!user?.id) {
    console.warn('No user ID provided for role lookup');
    return { role: ROLES.GUEST, isMaintainer: false };
  }

  const username = getGitHubUsername(user);
  
  // First, try to get existing role from database
  try {
    const { data: existingRole, error } = await supabase
      .from(TABLES.USER_ROLES)
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (existingRole && !error) {
      const isMaintainer = existingRole.role === ROLES.MAINTAINER;
      return { role: existingRole.role, isMaintainer };
    }
  } catch (error) {
    console.warn('Error fetching existing role:', error.message);
  }

  // If no role exists, resolve from GitHub and store it
  const { role, isMaintainer } = await resolveUserRole(user);
  
  // Store the role in Supabase
  try {
    await supabase
      .from(TABLES.USER_ROLES)
      .upsert({
        user_id: user.id,
        github_username: username,
        role: role,
        last_updated: new Date().toISOString()
      });
    
    console.log(`Stored role for user ${user.id}: ${role}`);
  } catch (error) {
    console.error('Error storing user role:', error.message);
    // Continue even if we can't store - we have the role from GitHub
  }

  return { role, isMaintainer };
}

/**
 * Refresh user role from GitHub (for when permissions change)
 * @param {object} user - Supabase user object
 * @returns {Promise<{role: string, isMaintainer: boolean}>}
 */
export async function refreshUserRole(user) {
  if (!user?.id) {
    return { role: ROLES.GUEST, isMaintainer: false };
  }

  const { role, isMaintainer } = await resolveUserRole(user);
  const username = getGitHubUsername(user);

  try {
    await supabase
      .from(TABLES.USER_ROLES)
      .upsert({
        user_id: user.id,
        github_username: username,
        role: role,
        last_updated: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error refreshing user role:', error.message);
  }

  return { role, isMaintainer };
}

/**
 * Check if user has a specific role or higher
 * @param {string} userRole - User's current role
 * @param {string|string[]} requiredRole - Required role(s)
 * @returns {boolean}
 */
export function hasRole(userRole, requiredRole) {
  const roleHierarchy = {
    [ROLES.GUEST]: 0,
    [ROLES.VIEWER]: 1,
    [ROLES.CONTRIBUTOR]: 2,
    [ROLES.MAINTAINER]: 3
  };

  const userLevel = roleHierarchy[userRole] || 0;
  
  if (Array.isArray(requiredRole)) {
    return requiredRole.some(role => {
      const requiredLevel = roleHierarchy[role] || 0;
      return userLevel >= requiredLevel;
    });
  }

  const requiredLevel = roleHierarchy[requiredRole] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Initialize the user_roles table in Supabase
 * This can be run manually if needed
 */
export async function initializeUserRolesTable() {
  try {
    // Check if table exists
    const { data, error } = await supabase
      .from(TABLES.USER_ROLES)
      .select('*')
      .limit(1);

    if (error && error.code === 'PGRST100') {
      // Table doesn't exist - this would need to be created via SQL
      console.warn('user_roles table does not exist. Please run the SQL migration.');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking user_roles table:', error.message);
    return false;
  }
}
