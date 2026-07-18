import { useAuth } from './context/AuthContext'
import LoginScreen from './components/LoginScreen'
import Dashboard from './components/Dashboard'

export default function App() {
  const { session, loading, isSupabaseConfigured } = useAuth()

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md bg-surface border border-line rounded-xl p-6">
          <h1 className="text-lg font-semibold mb-2">Configuration required</h1>
          <p className="text-ink-secondary text-sm leading-relaxed">
            Set <code className="font-mono text-ink">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-ink">VITE_SUPABASE_ANON_KEY</code> in your{' '}
            <code className="font-mono text-ink">.env</code> file, then restart the dev server.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-ink-muted text-sm">Loading session…</p>
      </div>
    )
  }

  return session ? <Dashboard /> : <LoginScreen />
}
