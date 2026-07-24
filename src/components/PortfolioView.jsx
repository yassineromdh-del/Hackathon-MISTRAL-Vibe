import { useEffect, useState } from 'react'
import { ShieldCheck, ShieldAlert, ShieldQuestion, Plus, X, ChevronRight } from 'lucide-react'
import { getLatestReport } from '../lib/reportsStore'
import { getRepos, addRepo, removeRepo } from '../lib/repos'

const GRADE_STYLES = {
  'A+': 'text-status-good', A: 'text-status-good', B: 'text-status-warning',
  C: 'text-status-serious', D: 'text-status-critical', F: 'text-status-critical',
}

function verdictOf(report) {
  if (!report?.jobs) return { label: 'No gate yet', tone: 'text-ink-muted', Icon: ShieldQuestion }
  const ok = Object.values(report.jobs).every((v) => v === 'success')
  return ok
    ? { label: 'Open', tone: 'text-status-good', Icon: ShieldCheck }
    : { label: 'Blocked', tone: 'text-status-critical', Icon: ShieldAlert }
}

export default function PortfolioView({ repos, onOpen, onReposChange }) {
  const [reports, setReports] = useState({}) // full -> report | null
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all(
      repos.map((full) => getLatestReport(full).then((r) => [full, r]).catch(() => [full, null]))
    ).then((entries) => {
      if (!cancelled) { setReports(Object.fromEntries(entries)); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [repos])

  const handleAdd = (e) => {
    e.preventDefault()
    const value = new FormData(e.target).get('repo')
    if (addRepo(value)) { onReposChange(getRepos()); setAdding(false) }
  }

  const handleRemove = (full) => onReposChange(removeRepo(full))

  const scored = repos
    .map((full) => ({ full, report: reports[full], ...verdictOf(reports[full]), score: reports[full]?.score ?? -1 }))
    .sort((a, b) => b.score - a.score)

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Portfolio</h2>
          <p className="text-ink-muted text-xs mt-0.5">
            {repos.length} projet{repos.length > 1 ? 's' : ''} surveillé{repos.length > 1 ? 's' : ''}
            {loading && ' · chargement…'}
          </p>
        </div>
        {adding ? (
          <form onSubmit={handleAdd} className="flex items-center gap-2">
            <input
              name="repo"
              autoFocus
              onBlur={() => setAdding(false)}
              placeholder="owner/repo"
              className="bg-page border border-line rounded-lg px-2.5 py-1.5 text-xs font-mono text-ink w-56 focus:outline-none focus:border-accent"
            />
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm border border-line rounded-lg px-3 py-2 text-ink-secondary hover:text-ink hover:border-line-strong transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Ajouter un projet
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {scored.map(({ full, report, label, tone, Icon, score }) => (
          <div
            key={full}
            className="group bg-surface border border-line rounded-xl p-5 hover:border-line-strong transition-colors cursor-pointer relative"
            onClick={() => onOpen(full)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(full) }}
              title="Retirer du portfolio"
              className="absolute top-3 right-3 text-ink-muted hover:text-status-critical opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            <div className="flex items-center justify-between mb-4 pr-6">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone}`}>
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </span>
              {report?.grade && (
                <span className={`text-2xl font-semibold ${GRADE_STYLES[report.grade] ?? 'text-ink'}`}>
                  {report.grade}
                </span>
              )}
            </div>

            <p className="font-mono text-sm text-ink truncate">{full.split('/')[1]}</p>
            <p className="text-ink-muted text-xs truncate">{full.split('/')[0]}</p>

            <div className="flex items-center justify-between mt-4">
              <span className="text-ink-secondary text-xs">
                {report ? `${report.score}/100` : '—'}
                {report?.generated_at && (
                  <span className="text-ink-muted"> · {new Date(report.generated_at).toLocaleDateString()}</span>
                )}
              </span>
              <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-accent transition-colors" aria-hidden="true" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
