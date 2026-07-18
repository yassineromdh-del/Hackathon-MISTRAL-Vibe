import { AlertTriangle, AlertOctagon, Info, ShieldQuestion } from 'lucide-react'

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

export default function FindingsPanel({ report }) {
  if (!report) return null

  const findings = [...(report.semgrep_findings ?? [])].sort((a, b) => rank(a.severity) - rank(b.severity))
  const vulns = [...(report.trivy_vulnerabilities ?? [])].sort((a, b) => rank(a.severity) - rank(b.severity))
  const leaks = report.gitleaks_leaks ?? []

  return (
    <section className="bg-surface border border-line rounded-xl overflow-hidden mb-8">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between">
        <h2 className="font-semibold text-sm">
          Findings — <span className="font-mono font-normal text-ink-secondary">{report.sha?.slice(0, 7)}</span>
        </h2>
        <span className="text-ink-muted text-xs">
          {findings.length} code finding{findings.length === 1 ? '' : 's'} · {vulns.length} dependency vuln{vulns.length === 1 ? '' : 's'} · {leaks.length} secret leak{leaks.length === 1 ? '' : 's'}
        </span>
      </div>

      {findings.length === 0 && vulns.length === 0 && leaks.length === 0 && (
        <p className="px-5 py-6 text-sm text-ink-muted">No findings in the latest scanned commit. 🎉</p>
      )}

      {findings.length > 0 && (
        <div className="divide-y divide-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-ink-muted">Semgrep — code</p>
          {findings.map((f, i) => (
            <div key={i} className="px-5 py-3 flex items-start gap-4">
              <div className="w-20 shrink-0 pt-0.5"><Severity value={f.severity} /></div>
              <div className="min-w-0">
                <p className="font-mono text-xs text-ink truncate">{f.rule}</p>
                <p className="text-ink-secondary text-sm mt-0.5">{f.message}</p>
                <p className="font-mono text-xs text-ink-muted mt-1">{f.file}:{f.line}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {leaks.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-ink-muted">Gitleaks — secrets</p>
          {leaks.map((l, i) => (
            <div key={i} className="px-5 py-3 flex items-start gap-4">
              <div className="w-20 shrink-0 pt-0.5"><Severity value="CRITICAL" /></div>
              <div className="min-w-0">
                <p className="text-sm text-ink">{l.description}</p>
                <p className="font-mono text-xs text-ink-muted mt-1">
                  {l.file}:{l.line} · rule {l.rule} · commit {l.commit}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {vulns.length > 0 && (
        <div className="divide-y divide-line border-t border-line">
          <p className="px-5 pt-4 pb-2 text-xs uppercase tracking-wide text-ink-muted">Trivy — dependencies</p>
          {vulns.map((v, i) => (
            <div key={i} className="px-5 py-3 flex items-start gap-4">
              <div className="w-20 shrink-0 pt-0.5"><Severity value={v.severity} /></div>
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  <span className="font-mono">{v.package}</span>
                  <span className="text-ink-muted"> {v.installed}</span>
                  {v.fixed && <span className="text-status-good text-xs"> → fix: {v.fixed}</span>}
                </p>
                <p className="text-ink-secondary text-sm mt-0.5">{v.title}</p>
                <p className="font-mono text-xs text-ink-muted mt-1">{v.id}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
