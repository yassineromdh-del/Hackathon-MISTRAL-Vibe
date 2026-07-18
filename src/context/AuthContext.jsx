import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getOrCreateUserRole, refreshUserRole } from '../lib/roleService'
import { ROLES } from '../lib/constants'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState(ROLES.GUEST)
  const [isMaintainer, setIsMaintainer] = useState(false)
  const [roleLoading, setRoleLoading] = useState(false)

  // Fetch and set user role from Supabase/GitHub
  const fetchUserRole = useCallback(async (user) => {
    if (!user) {
      setRole(ROLES.GUEST)
      setIsMaintainer(false)
      return
    }

    setRoleLoading(true)
    try {
      const { role: userRole, isMaintainer: userIsMaintainer } = await getOrCreateUserRole(user)
      setRole(userRole)
      setIsMaintainer(userIsMaintainer)
    } catch (error) {
      console.error('Error fetching user role:', error)
      // Fallback to guest
      setRole(ROLES.GUEST)
      setIsMaintainer(false)
    } finally {
      setRoleLoading(false)
    }
  }, [])

  // Refresh role from GitHub (for permission updates)
  const refreshRole = useCallback(async () => {
    if (!user) return
    
    setRoleLoading(true)
    try {
      const { role: userRole, isMaintainer: userIsMaintainer } = await refreshUserRole(user)
      setRole(userRole)
      setIsMaintainer(userIsMaintainer)
    } catch (error) {
      console.error('Error refreshing role:', error)
    } finally {
      setRoleLoading(false)
    }
  }, [user])

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        fetchUserRole(currentUser)
      }
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await fetchUserRole(currentUser)
      } else {
        setRole(ROLES.GUEST)
        setIsMaintainer(false)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [fetchUserRole])

  const signInWithGitHub = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin,
        // Request additional scopes if needed
        scopes: 'repo read:user'
      }
    })
    if (error) {
      console.error('Error signing in:', error)
      return null
    }
    return true
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error)
      return false
    }
    setUser(null)
    setRole(ROLES.GUEST)
    setIsMaintainer(false)
    return true
  }

  const value = {
    user,
    loading,
    roleLoading,
    signedIn: !!user,
    role,
    isMaintainer,
    signInWithGitHub,
    signOut,
    refreshRole
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
