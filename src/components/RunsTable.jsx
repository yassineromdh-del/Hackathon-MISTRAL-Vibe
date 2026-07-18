import { ExternalLink, GitBranch } from 'lucide-react'
import StatusBadge, { statusOf } from './StatusBadge'

function duration(run) {
  if (!run.updated_at || !run.run_started_at) return '—'
  const secs = Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000)
  if (secs < 0) return '—'
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export default function RunsTable({ runs, loading }) {
  return (
    <section className="bg-surface border border-line rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-line">
        <h2 className="font-semibold text-sm">Run history</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted text-xs border-b border-line">
            <th className="px-5 py-2.5 font-medium">Status</th>
            <th className="px-5 py-2.5 font-medium">Commit</th>
            <th className="px-5 py-2.5 font-medium hidden sm:table-cell">Branch</th>
            <th className="px-5 py-2.5 font-medium hidden md:table-cell">Trigger</th>
            <th className="px-5 py-2.5 font-medium tabular-nums">Duration</th>
            <th className="px-5 py-2.5 font-medium hidden md:table-cell">Date</th>
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-8 text-center text-ink-muted">
                {loading ? 'Loading runs…' : 'No workflow runs yet.'}
              </td>
            </tr>
          )}
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-line last:border-0 hover:bg-line/30 transition-colors">
              <td className="px-5 py-3"><StatusBadge status={statusOf(run)} /></td>
              <td className="px-5 py-3">
                <p className="font-mono text-xs text-ink">{run.head_sha.slice(0, 7)}</p>
                <p className="text-ink-muted text-xs truncate max-w-[16rem]">
                  {run.head_commit?.message?.split('\n')[0]}
                </p>
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
          ))}
        </tbody>
      </table>
    </section>
  )
}
