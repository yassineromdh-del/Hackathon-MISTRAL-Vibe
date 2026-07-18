import { useCallback, useEffect, useState } from 'react'
import { LogOut, RefreshCw, ShieldCheck, ShieldAlert, SearchCode, KeyRound, Package } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchWorkflowRuns, fetchRunJobs } from '../lib/githubApi'
import { REPO_OWNER, REPO_NAME } from '../lib/constants'
import StatusBadge, { statusOf } from './StatusBadge'
import RunsTable from './RunsTable'

const TOOLS = [
  { key: 'semgrep', match: 'semgrep', title: 'Semgrep', subtitle: 'SAST — code patterns', Icon: SearchCode },
  { key: 'gitleaks', match: 'gitleaks', title: 'Gitleaks', subtitle: 'Secrets detection', Icon: KeyRound },
  { key: 'trivy', match: 'trivy', title: 'Trivy', subtitle: 'Dependency vulnerabilities', Icon: Package },
]

const ROLE_STYLES = {
  maintainer: 'bg-accent/15 text-accent',
  contributor: 'bg-status-good/15 text-status-good',
  viewer: 'bg-line text-ink-secondary',
  guest: 'bg-line text-ink-muted',
}

export default function Dashboard() {
  const { user, role, signOut } = useAuth()
  const [runs, setRuns] = useState([])
  const [latestJobs, setLatestJobs] = useState([])
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(true)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const workflowRuns = await fetchWorkflowRuns()
      setRuns(workflowRuns)
      if (workflowRuns[0]) {
        setLatestJobs(await fetchRunJobs(workflowRuns[0].id))
      } else {
        setLatestJobs([])
      }
    } catch (err) {
      setError(
        err.status === 404
          ? 'No security-gate workflow found on this repository yet. Push the workflow file to see runs here.'
          : `Could not load workflow runs (${err.message}). Check your GitHub token or rate limit.`
      )
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const latestRun = runs[0]
  const gateStatus = statusOf(latestRun)
  const gatePassed = gateStatus === 'success'
  const passedCount = runs.filter((r) => r.conclusion === 'success').length
  const completedCount = runs.filter((r) => r.status === 'completed').length

  const username = user?.user_metadata?.user_name ?? user?.email
  const avatar = user?.user_metadata?.avatar_url

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 py-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">Zero-to-Prod</h1>
          <p className="text-ink-muted text-xs font-mono mt-0.5">{REPO_OWNER}/{REPO_NAME}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${ROLE_STYLES[role]}`}>
            {role}
          </span>
          {avatar && <img src={avatar} alt="" className="w-8 h-8 rounded-full border border-line" />}
          <span className="text-sm text-ink-secondary hidden sm:block">{username}</span>
          <button
            onClick={signOut}
            title="Sign out"
            className="p-2 rounded-lg border border-line text-ink-muted hover:text-ink hover:border-line-strong transition-colors"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-6 bg-surface border border-status-serious/40 rounded-xl p-4 text-sm text-ink-secondary">
          {error}
        </div>
      )}

      {/* Gate hero */}
      <section
        className={`bg-surface border rounded-xl p-6 mb-6 ${
          !latestRun ? 'border-line' : gatePassed ? 'border-status-good/40' : 'border-status-critical/40'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {gatePassed
              ? <ShieldCheck className="w-10 h-10 text-status-good" aria-hidden="true" />
              : <ShieldAlert className={`w-10 h-10 ${latestRun ? 'text-status-critical' : 'text-ink-muted'}`} aria-hidden="true" />}
            <div>
              <p className="text-ink-muted text-xs uppercase tracking-wide mb-1">Security gate — latest run</p>
              <p className="text-3xl font-semibold">
                {!latestRun ? 'No runs yet' : gatePassed ? 'Open' : gateStatus === 'failure' ? 'Blocked' : 'Pending'}
              </p>
              {latestRun && (
                <p className="text-ink-secondary text-sm mt-1">
                  <span className="font-mono">{latestRun.head_sha.slice(0, 7)}</span>
                  {' · '}{latestRun.head_branch}{' · '}
                  {new Date(latestRun.created_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-2xl font-semibold">{completedCount ? `${passedCount}/${completedCount}` : '—'}</p>
              <p className="text-ink-muted text-xs">runs passed (last {runs.length || '—'})</p>
            </div>
            <button
              onClick={load}
              disabled={refreshing}
              className="flex items-center gap-2 text-sm border border-line rounded-lg px-3 py-2 text-ink-secondary hover:text-ink hover:border-line-strong transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Tool status cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {TOOLS.map(({ key, match, title, subtitle, Icon }) => {
          const job = latestJobs.find((j) => j.name.toLowerCase().includes(match))
          return (
            <div key={key} className="bg-surface border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <Icon className="w-5 h-5 text-ink-secondary" aria-hidden="true" />
                <StatusBadge status={statusOf(job)} />
              </div>
              <p className="font-semibold">{title}</p>
              <p className="text-ink-muted text-xs mt-0.5">{subtitle}</p>
              {job?.html_url && (
                <a
                  href={job.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent text-xs mt-3 inline-block hover:underline"
                >
                  View job log →
                </a>
              )}
            </div>
          )
        })}
      </section>

      <RunsTable runs={runs} loading={refreshing} />
    </div>
  )
}
