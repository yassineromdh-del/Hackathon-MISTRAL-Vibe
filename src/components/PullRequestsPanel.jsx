import { GitPullRequest, ExternalLink, Clock } from 'lucide-react'
import StatusBadge, { statusOf } from './StatusBadge'

// Verdict per PR by joining on the runs already fetched — head_sha matches on
// both sides (PR head), so this costs zero extra API calls. A PR whose gate run
// scrolled past the fetched window shows "no run yet" (neutral, never "failed").
export default function PullRequestsPanel({ pulls, runs }) {
  const runByHead = new Map()
  for (const r of runs ?? []) {
    if (!runByHead.has(r.head_sha)) runByHead.set(r.head_sha, r) // runs come newest-first
  }

  const items = pulls ?? []

  return (
    <section className="bg-surface border border-line rounded-xl overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitPullRequest className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
          <h2 className="font-semibold text-sm">Pull requests ouvertes</h2>
        </div>
        <span className="text-ink-muted text-xs">{items.length} ouverte{items.length === 1 ? '' : 's'}</span>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-secondary text-center">
          Aucune pull request ouverte.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((pr) => {
            const run = runByHead.get(pr.head?.sha)
            return (
              <li key={pr.id} className="px-5 py-3 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">
                    <span className="text-ink-muted font-mono">#{pr.number}</span> {pr.title}
                  </p>
                  <p className="text-ink-muted text-xs mt-0.5 truncate">
                    {pr.user?.login} · <span className="font-mono">{pr.head?.ref}</span> → {pr.base?.ref}
                  </p>
                </div>
                <div className="shrink-0">
                  {run ? (
                    <StatusBadge status={statusOf(run)} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                      <Clock className="w-4 h-4" aria-hidden="true" />
                      No gate run yet
                    </span>
                  )}
                </div>
                <a
                  href={pr.html_url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open PR on GitHub"
                  className="shrink-0 text-ink-muted hover:text-accent transition-colors"
                >
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
