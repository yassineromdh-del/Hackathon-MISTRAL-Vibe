import { useCallback, useEffect, useMemo, useState } from 'react'
import { LogOut, RefreshCw, ShieldCheck, ShieldAlert, SearchCode, KeyRound, Package, LayoutGrid, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { fetchWorkflowRuns, fetchRunJobs, fetchGateReport, fetchGateHistory, fetchPullRequests } from '../lib/githubApi'
import { getRepo, setRepo } from '../lib/repo'
import { getRepos, addRepo } from '../lib/repos'
import StatusBadge, { statusOf } from './StatusBadge'
import RunsTable from './RunsTable'
import FindingsPanel from './FindingsPanel'
import ScoreTrend from './ScoreTrend'
import PullRequestsPanel from './PullRequestsPanel'
import PortfolioView from './PortfolioView'

const REFRESH_INTERVAL_MS = 30_000

const TOOLS = [
  { key: 'semgrep', match: 'semgrep', title: 'Semgrep', subtitle: 'SAST — code patterns', Icon: SearchCode, reportKey: 'semgrep_findings' },
  { key: 'gitleaks', match: 'gitleaks', title: 'Gitleaks', subtitle: 'Secrets detection', Icon: KeyRound, reportKey: 'gitleaks_leaks' },
  { key: 'trivy', match: 'trivy', title: 'Trivy', subtitle: 'Dependency vulnerabilities', Icon: Package, reportKey: 'trivy_vulnerabilities' },
]

// One readable line per tool — the dev should never need the raw CI logs.
function toolSummary(entries) {
  if (!entries) return null
  const blocking = entries.filter((e) => e.blocking ?? true).length
  const advisory = entries.length - blocking
  if (entries.length === 0) return { text: 'Aucun finding ✓', tone: 'text-status-good' }
  if (blocking > 0) {
    return {
      text: `${blocking} bloquant${blocking > 1 ? 's' : ''}${advisory ? ` · ${advisory} avis` : ''}`,
      tone: 'text-status-critical',
    }
  }
  return { text: `${advisory} avis non bloquant${advisory > 1 ? 's' : ''}`, tone: 'text-status-warning' }
}

// Grade tone follows the status palette; the letter itself carries the value.
const GRADE_STYLES = {
  'A+': 'text-status-good', A: 'text-status-good', B: 'text-status-warning',
  C: 'text-status-serious', D: 'text-status-critical', F: 'text-status-critical',
}

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
  const [report, setReport] = useState(null)
  const [history, setHistory] = useState([])
  const [pulls, setPulls] = useState([])
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(true)
  const [repo, setRepoState] = useState(getRepo().full)
  const [editingRepo, setEditingRepo] = useState(false)
  const [repos, setReposState] = useState(getRepos())
  const [view, setView] = useState(() => (getRepos().length > 1 ? 'portfolio' : 'detail'))

  // Open a project from the portfolio → make it active and drill into detail.
  const openRepo = useCallback((full) => {
    if (setRepo(full)) {
      setRepoState(getRepo().full)
      addRepo(full)
      setReposState(getRepos())
      setReport(null)
      setHistory([])
      setView('detail')
    }
  }, [])

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      fetchGateReport().then(setReport).catch(() => {})
      fetchGateHistory().then(setHistory).catch(() => {})
      fetchPullRequests().then(setPulls).catch(() => setPulls([]))
      const workflowRuns = await fetchWorkflowRuns(50)
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

  useEffect(() => {
    load()
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load, repo])

  const latestRun = runs[0]
  const gateStatus = statusOf(latestRun)
  const gatePassed = gateStatus === 'success'
  const passedCount = runs.filter((r) => r.conclusion === 'success').length
  const completedCount = runs.filter((r) => r.status === 'completed').length

  // Join score history onto runs by head_sha (see the workflow's head_sha fix).
  const scoreBySha = useMemo(
    () => new Map(history.map((h) => [h.head_sha ?? h.sha, { score: h.score, grade: h.grade }])),
    [history]
  )

  const username = user?.user_metadata?.user_name ?? user?.email
  const avatar = user?.user_metadata?.avatar_url

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 py-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold">Zero-to-Prod</h1>
          {view === 'portfolio' ? (
            <p className="text-ink-muted text-xs font-mono mt-0.5">Security Gate Portfolio</p>
          ) : editingRepo ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const value = new FormData(e.target).get('repo')
                if (setRepo(value)) {
                  setRepoState(getRepo().full)
                  setReport(null)
                  setEditingRepo(false)
                  load()
                }
              }}
            >
              <input
                name="repo"
                defaultValue={repo}
                autoFocus
                onBlur={() => setEditingRepo(false)}
                placeholder="owner/repo"
                className="mt-0.5 bg-page border border-line rounded px-1.5 py-0.5 text-xs font-mono text-ink w-64 focus:outline-none focus:border-accent"
              />
            </form>
          ) : (
            <button
              onClick={() => setEditingRepo(true)}
              title="Changer de repo surveillé"
              className="text-ink-muted text-xs font-mono mt-0.5 hover:text-accent transition-colors"
            >
              {repo} ✎
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {view === 'detail' && (
            <button
              onClick={() => { setReposState(getRepos()); setView('portfolio') }}
              title="Voir tous les projets"
              className="flex items-center gap-1.5 text-xs border border-line rounded-lg px-2.5 py-1.5 text-ink-secondary hover:text-ink hover:border-line-strong transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
              Projets
            </button>
          )}
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

      {view === 'portfolio' ? (
        <PortfolioView repos={repos} onOpen={openRepo} onReposChange={setReposState} />
      ) : (
      <>
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
          <div className="flex items-center gap-6">
            {report?.grade && (
              <div className="text-right">
                <p className={`text-4xl font-semibold ${GRADE_STYLES[report.grade] ?? 'text-ink'}`}>{report.grade}</p>
                <p className="text-ink-muted text-xs">security score {report.score}/100</p>
              </div>
            )}
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

      <ScoreTrend history={history} />

      {/* Tool status cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {TOOLS.map(({ key, match, title, subtitle, Icon, reportKey }) => {
          const job = latestJobs.find((j) => j.name.toLowerCase().includes(match))
          const summary = report?.sha === latestRun?.head_sha ? toolSummary(report?.[reportKey]) : null
          return (
            <div key={key} className="bg-surface border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <Icon className="w-5 h-5 text-ink-secondary" aria-hidden="true" />
                <StatusBadge status={statusOf(job)} />
              </div>
              <p className="font-semibold">{title}</p>
              <p className="text-ink-muted text-xs mt-0.5">{subtitle}</p>
              {summary && <p className={`text-sm font-medium mt-3 ${summary.tone}`}>{summary.text}</p>}
              {latestRun?.html_url && (
                <a
                  href={latestRun.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent text-xs mt-2 inline-block hover:underline"
                >
                  Rapport lisible du run →
                </a>
              )}
            </div>
          )
        })}
      </section>

      <PullRequestsPanel pulls={pulls} runs={runs} />

      <FindingsPanel report={report} />

      <RunsTable runs={runs} loading={refreshing} scoreBySha={scoreBySha} />
      </>
      )}
    </div>
  )
}
