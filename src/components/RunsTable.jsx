import { useMemo, useState } from 'react'
import { ExternalLink, GitBranch, Search } from 'lucide-react'
import StatusBadge, { statusOf } from './StatusBadge'

const PAGE = 20

const GRADE_COLOR = {
  'A+': 'text-status-good', A: 'text-status-good', B: 'text-status-warning',
  C: 'text-status-serious', D: 'text-status-critical', F: 'text-status-critical',
}

function duration(run) {
  if (!run.updated_at || !run.run_started_at) return '—'
  const secs = Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000)
  if (secs < 0) return '—'
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export default function RunsTable({ runs, loading, scoreBySha }) {
  const [branch, setBranch] = useState('all')
  const [verdict, setVerdict] = useState('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const branches = useMemo(
    () => Array.from(new Set((runs ?? []).map((r) => r.head_branch).filter(Boolean))),
    [runs]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (runs ?? []).filter((r) => {
      if (branch !== 'all' && r.head_branch !== branch) return false
      if (verdict === 'passed' && r.conclusion !== 'success') return false
      if (verdict === 'failed' && r.conclusion !== 'failure') return false
      if (q && !`${r.head_sha} ${r.head_commit?.message ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [runs, branch, verdict, query])

  const visible = filtered.slice(0, limit)

  const selectCls =
    'bg-page border border-line rounded-lg px-2 py-1 text-xs text-ink-secondary focus:outline-none focus:border-accent'

  return (
    <section className="bg-surface border border-line rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-sm">Run history</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={branch} onChange={(e) => { setBranch(e.target.value); setLimit(PAGE) }} className={selectCls}>
            <option value="all">Toutes branches</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={verdict} onChange={(e) => { setVerdict(e.target.value); setLimit(PAGE) }} className={selectCls}>
            <option value="all">Tous verdicts</option>
            <option value="passed">Passés</option>
            <option value="failed">Échoués</option>
          </select>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setLimit(PAGE) }}
              placeholder="commit / message…"
              className="bg-page border border-line rounded-lg pl-7 pr-2 py-1 text-xs text-ink w-44 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted text-xs border-b border-line">
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium">Commit</th>
              <th className="px-5 py-2.5 font-medium">Score</th>
              <th className="px-5 py-2.5 font-medium hidden sm:table-cell">Branch</th>
              <th className="px-5 py-2.5 font-medium hidden md:table-cell">Trigger</th>
              <th className="px-5 py-2.5 font-medium tabular-nums">Duration</th>
              <th className="px-5 py-2.5 font-medium hidden md:table-cell">Date</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-ink-muted">
                  {loading ? 'Loading runs…' : (runs?.length ? 'Aucun run ne correspond au filtre.' : 'No workflow runs yet.')}
                </td>
              </tr>
            )}
            {visible.map((run) => {
              const sc = scoreBySha?.get(run.head_sha)
              return (
                <tr key={run.id} className="border-b border-line last:border-0 hover:bg-line/30 transition-colors">
                  <td className="px-5 py-3"><StatusBadge status={statusOf(run)} /></td>
                  <td className="px-5 py-3">
                    <p className="font-mono text-xs text-ink">{run.head_sha.slice(0, 7)}</p>
                    <p className="text-ink-muted text-xs truncate max-w-[16rem]">
                      {run.head_commit?.message?.split('\n')[0]}
                    </p>
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {sc ? (
                      <span className={`text-xs font-medium ${GRADE_COLOR[sc.grade] ?? 'text-ink'}`}>
                        {sc.grade} <span className="text-ink-muted">{sc.score}</span>
                      </span>
                    ) : (
                      <span className="text-ink-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 hidden sm:table-cell">
                    <span className="inline-flex items-center gap-1 text-ink-secondary text-xs">
                      <GitBranch className="w-3.5 h-3.5" aria-hidden="true" />
                      {run.head_branch}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink-secondary text-xs hidden md:table-cell">{run.event}</td>
                  <td className="px-5 py-3 text-ink-secondary text-xs tabular-nums">{duration(run)}</td>
                  <td className="px-5 py-3 text-ink-secondary text-xs hidden md:table-cell">
                    {new Date(run.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <a
                      href={run.html_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open on GitHub"
                      className="inline-block text-ink-muted hover:text-accent transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" aria-hidden="true" />
                    </a>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <div className="px-5 py-3 border-t border-line text-center">
          <button
            onClick={() => setLimit((l) => l + PAGE)}
            className="text-xs text-ink-secondary hover:text-accent border border-line hover:border-line-strong rounded-lg px-3 py-1.5 transition-colors"
          >
            Voir plus ({filtered.length - limit} de plus)
          </button>
        </div>
      )}
    </section>
  )
}
