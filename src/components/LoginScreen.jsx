import { Github, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { REPO_OWNER, REPO_NAME } from '../lib/constants'

export default function LoginScreen() {
  const { signInWithGitHub } = useAuth()

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md bg-surface border border-line rounded-xl p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6 text-accent" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold">Zero-to-Prod</h1>
        <p className="text-ink-secondary text-sm mt-1 mb-1">Security Gate Dashboard</p>
        <p className="text-ink-muted text-xs mb-8 font-mono">
          {REPO_OWNER}/{REPO_NAME}
        </p>
        <button
          onClick={signInWithGitHub}
          className="w-full flex items-center justify-center gap-2 bg-ink text-page font-medium rounded-lg px-4 py-2.5 hover:opacity-90 transition-opacity"
        >
          <Github className="w-4 h-4" aria-hidden="true" />
          Sign in with GitHub
        </button>
        <p className="text-ink-muted text-xs mt-4">
          Your role (maintainer / contributor / viewer) is derived from your GitHub
          permissions on the repository.
        </p>
      </div>
    </div>
  )
}
