import { AlertTriangle, AlertOctagon, Info, ShieldQuestion, ShieldCheck, Wrench, EyeOff } from 'lucide-react'

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

// Normalize the three tools' findings into one shape the panel can render.
function normalize(report) {
  const items = []
  for (const f of report.semgrep_findings ?? []) {
    items.push({
      tool: 'Semgrep',
      severity: f.severity,
      blocking: f.blocking ?? f.severity === 'ERROR',
      title: f.rule?.split('.').pop(),
      problem: f.message,
      solution: f.remediation,
      location: `${f.file}:${f.line}`,
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
      location: v.fixed ? `fix available: ${v.fixed}` : 'no fix yet',
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
      location: `${l.file}:${l.line} (commit ${l.commit})`,
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
        <p className="font-mono text-xs text-ink-muted mt-1">{item.location}</p>
      </div>
    </div>
  )
}

export default function FindingsPanel({ report }) {
  if (!report) return null

  const items = normalize(report)
  const blocking = items.filter((i) => i.blocking)
  const advisory = items.filter((i) => !i.blocking)
  const waivers = report.waivers ?? []

  return (
    <section className="bg-surface border border-line rounded-xl overflow-hidden mb-8">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="font-semibold text-sm">
          Findings — <span className="font-mono font-normal text-ink-secondary">{report.sha?.slice(0, 7)}</span>
        </h2>
        <span className="text-ink-muted text-xs">
          {blocking.length} bloquant{blocking.length === 1 ? '' : 's'} · {advisory.length} avis · {waivers.length} faux positif{waivers.length === 1 ? '' : 's'} assumé{waivers.length === 1 ? '' : 's'}
        </span>
      </div>

      {items.length === 0 && (
        <p className="px-5 py-5 text-sm text-ink-secondary flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-status-good" aria-hidden="true" />
          Aucun finding sur le dernier commit scanné.
        </p>
      )}

      {blocking.length > 0 && (
        <div className="divide-y divide-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-status-critical font-medium">
            Bloquants — la gate refuse le merge
          </p>
          {blocking.map((item, i) => <FindingRow key={i} item={item} />)}
        </div>
      )}

      {advisory.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-ink-muted">
            Avis — non bloquants, à corriger quand possible
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
