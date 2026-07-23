import { useMemo, useState } from 'react'
import { AlertTriangle, AlertOctagon, Info, ShieldQuestion, ShieldCheck, Wrench, EyeOff, Search, ExternalLink } from 'lucide-react'
import { getRepo } from '../lib/repo'

// Severity always reads as icon + label, never color alone.
const SEVERITIES = {
  CRITICAL: { label: 'Critical', color: 'text-status-critical', Icon: AlertOctagon, rank: 0 },
  ERROR: { label: 'Error', color: 'text-status-critical', Icon: AlertOctagon, rank: 0 },
  HIGH: { label: 'High', color: 'text-status-serious', Icon: AlertTriangle, rank: 1 },
  MEDIUM: { label: 'Medium', color: 'text-status-warning', Icon: AlertTriangle, rank: 2 },
  WARNING: { label: 'Warning', color: 'text-status-warning', Icon: AlertTriangle, rank: 2 },
  LOW: { label: 'Low', color: 'text-ink-muted', Icon: Info, rank: 3 },
  INFO: { label: 'Info', color: 'text-ink-muted', Icon: Info, rank: 3 },
}

function Severity({ value }) {
  const s = SEVERITIES[value] ?? { label: value || '?', color: 'text-ink-muted', Icon: ShieldQuestion }
  const Icon = s.Icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.color}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {s.label}
    </span>
  )
}

const rank = (sev) => SEVERITIES[sev]?.rank ?? 4

// Normalize the three tools' findings into one structured shape. The code link
// is built from the commit each tool actually scanned: report.head_sha for
// Semgrep (the run's head, not the PR merge commit), the leak's own commit for
// Gitleaks. Trivy findings have no source location.
function normalize(report) {
  const repo = getRepo().full
  const blob = (sha, file, line) =>
    sha && file ? `https://github.com/${repo}/blob/${sha}/${file}${line ? `#L${line}` : ''}` : null

  const items = []
  for (const f of report.semgrep_findings ?? []) {
    items.push({
      tool: 'Semgrep',
      severity: f.severity,
      blocking: f.blocking ?? f.severity === 'ERROR',
      title: f.rule?.split('.').pop(),
      problem: f.message,
      solution: f.remediation,
      locationText: `${f.file}:${f.line}`,
      href: blob(report.head_sha ?? report.sha, f.file, f.line),
    })
  }
  for (const v of report.trivy_vulnerabilities ?? []) {
    items.push({
      tool: 'Trivy',
      severity: v.severity,
      blocking: v.blocking ?? true,
      title: `${v.package} ${v.installed} — ${v.id}`,
      problem: v.title,
      solution: v.remediation,
      locationText: v.fixed ? `fix available: ${v.fixed}` : 'no fix yet',
      href: null,
    })
  }
  for (const l of report.gitleaks_leaks ?? []) {
    items.push({
      tool: 'Gitleaks',
      severity: l.severity ?? 'CRITICAL',
      blocking: l.blocking ?? true,
      title: l.rule,
      problem: l.description,
      solution: l.remediation,
      locationText: `${l.file}:${l.line} (commit ${l.commit})`,
      href: blob(l.commit, l.file, l.line),
    })
  }
  return items.sort((a, b) => rank(a.severity) - rank(b.severity))
}

function FindingRow({ item }) {
  return (
    <div className="px-5 py-3 flex items-start gap-4">
      <div className="w-20 shrink-0 pt-0.5">
        <Severity value={item.severity} />
        <p className="text-ink-muted text-[10px] mt-1">{item.tool}</p>
      </div>
      <div className="min-w-0">
        <p className="font-mono text-xs text-ink truncate">{item.title}</p>
        <p className="text-ink-secondary text-sm mt-0.5">
          <span className="text-ink-muted">Problème : </span>{item.problem}
        </p>
        {item.solution && (
          <p className="text-ink-secondary text-sm mt-1 flex gap-1.5">
            <Wrench className="w-3.5 h-3.5 mt-0.5 shrink-0 text-status-good" aria-hidden="true" />
            <span><span className="text-ink-muted">Solution : </span>{item.solution}</span>
          </p>
        )}
        {item.href ? (
          <a
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-accent mt-1 inline-flex items-center gap-1 hover:underline"
          >
            {item.locationText}
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        ) : (
          <p className="font-mono text-xs text-ink-muted mt-1">{item.locationText}</p>
        )}
      </div>
    </div>
  )
}

const TOOLS = ['Semgrep', 'Gitleaks', 'Trivy']
const VIEWS = [
  { key: 'all', label: 'Tous' },
  { key: 'blocking', label: 'Bloquants' },
  { key: 'advisory', label: 'Avis' },
]

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-accent/15 text-accent border-accent/40'
          : 'border-line text-ink-secondary hover:text-ink hover:border-line-strong'
      }`}
    >
      {children}
    </button>
  )
}

export default function FindingsPanel({ report }) {
  const [tool, setTool] = useState('all')
  const [view, setView] = useState('all')
  const [query, setQuery] = useState('')

  const items = useMemo(() => (report ? normalize(report) : []), [report])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => {
      if (tool !== 'all' && i.tool !== tool) return false
      if (view === 'blocking' && !i.blocking) return false
      if (view === 'advisory' && i.blocking) return false
      if (q && !`${i.title} ${i.problem} ${i.locationText}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, tool, view, query])

  if (!report) return null

  const blocking = filtered.filter((i) => i.blocking)
  const advisory = filtered.filter((i) => !i.blocking)
  const waivers = report.waivers ?? []
  const totalBlocking = items.filter((i) => i.blocking).length
  const totalAdvisory = items.length - totalBlocking

  return (
    <section className="bg-surface border border-line rounded-xl overflow-hidden mb-8">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-sm">
          Findings — <span className="font-mono font-normal text-ink-secondary">{report.sha?.slice(0, 7)}</span>
        </h2>
        <span className="text-ink-muted text-xs">
          {totalBlocking} bloquant{totalBlocking === 1 ? '' : 's'} · {totalAdvisory} avis · {waivers.length} faux positif{waivers.length === 1 ? '' : 's'} assumé{waivers.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Drilldown toolbar */}
      {items.length > 0 && (
        <div className="px-5 py-3 border-b border-line flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Chip active={tool === 'all'} onClick={() => setTool('all')}>Tous outils</Chip>
            {TOOLS.map((t) => (
              <Chip key={t} active={tool === t} onClick={() => setTool(t)}>{t}</Chip>
            ))}
          </div>
          <span className="w-px h-4 bg-line mx-1 hidden sm:block" />
          <div className="flex items-center gap-1.5">
            {VIEWS.map((v) => (
              <Chip key={v.key} active={view === v.key} onClick={() => setView(v.key)}>{v.label}</Chip>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer règle / fichier…"
              className="bg-page border border-line rounded-lg pl-7 pr-2 py-1 text-xs text-ink w-48 focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {items.length === 0 && (
        <p className="px-5 py-5 text-sm text-ink-secondary flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-status-good" aria-hidden="true" />
          Aucun finding sur le dernier commit scanné.
        </p>
      )}

      {items.length > 0 && filtered.length === 0 && (
        <p className="px-5 py-5 text-sm text-ink-muted">Aucun finding ne correspond au filtre.</p>
      )}

      {blocking.length > 0 && (
        <div className="divide-y divide-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-status-critical font-medium">
            Bloquants — la gate refuse le merge ({blocking.length})
          </p>
          {blocking.map((item, i) => <FindingRow key={i} item={item} />)}
        </div>
      )}

      {advisory.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-ink-muted">
            Avis — non bloquants, à corriger quand possible ({advisory.length})
          </p>
          {advisory.map((item, i) => <FindingRow key={i} item={item} />)}
        </div>
      )}

      {waivers.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-ink-muted">
            Faux positifs assumés — exclus du scan, avec justification
          </p>
          {waivers.map((w, i) => (
            <div key={i} className="px-5 py-3 flex items-start gap-4">
              <div className="w-20 shrink-0 pt-0.5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
                  <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  Waived
                </span>
                <p className="text-ink-muted text-[10px] mt-1 capitalize">{w.tool}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-ink">{w.what}</p>
                <p className="text-ink-secondary text-sm mt-0.5">
                  <span className="text-ink-muted">Pourquoi : </span>{w.why}
                </p>
                <p className="font-mono text-xs text-ink-muted mt-1">{w.where}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
