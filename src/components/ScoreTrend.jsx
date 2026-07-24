import { useState } from 'react'
import { TrendingUp } from 'lucide-react'

// Theme tokens (mirror tailwind.config.js) — SVG needs real colors, not classes.
const C = {
  accent: '#3987e5',
  ink: '#ffffff',
  inkSecondary: '#c3c2b7',
  inkMuted: '#898781',
  line: '#2c2c2a',
  surface: '#1a1a19',
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

// Grade thresholds (score floor) mirror the workflow's grading.
const BANDS = [
  { grade: 'A+', floor: 95, color: C.good },
  { grade: 'A', floor: 85, color: C.good },
  { grade: 'B', floor: 70, color: C.warning },
  { grade: 'C', floor: 50, color: C.serious },
  { grade: 'D', floor: 30, color: C.critical },
]

const gradeColor = (g) => (BANDS.find((b) => b.grade === g) || { color: C.critical }).color

const TOOL_LABELS = { semgrep: 'Semgrep', gitleaks: 'Gitleaks', trivy: 'Trivy' }

// Explain a run relative to the one before it: signed score delta + a plain
// cause. Reads jobs / blocking_count / advisory_count that the gate workflow
// records per run; older history entries may lack them, so every read is
// guarded and we degrade gracefully to "recomposition des findings".
function explainVariation(curr, prev) {
  if (!curr || !prev) return null
  const delta = (curr.score ?? 0) - (prev.score ?? 0)
  const jc = curr.jobs ?? {}
  const jp = prev.jobs ?? {}
  const flips = []
  for (const k of ['semgrep', 'gitleaks', 'trivy']) {
    if (jp[k] && jc[k] && jp[k] !== jc[k]) {
      flips.push(`${TOOL_LABELS[k]} ${jc[k] === 'success' ? 'repassé au vert' : 'en échec'}`)
    }
  }
  const db = (curr.blocking_count ?? 0) - (prev.blocking_count ?? 0)
  const da = (curr.advisory_count ?? 0) - (prev.advisory_count ?? 0)
  const signed = (n, sing, plur) => `${n > 0 ? '+' : ''}${n} ${Math.abs(n) > 1 ? plur : sing}`

  let cause
  if (flips.length) cause = flips.join(' · ')
  else if (db !== 0) cause = signed(db, 'finding bloquant', 'findings bloquants')
  else if (da !== 0) cause = signed(da, 'avis', 'avis')
  else if (delta !== 0) cause = 'recomposition de la sévérité des findings'
  else cause = 'aucun changement'

  return { delta, cause, dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' }
}

const deltaArrow = (d) => (d > 0 ? '↑' : d < 0 ? '↓' : '→')
const deltaClass = (d) => (d > 0 ? 'text-status-good' : d < 0 ? 'text-status-critical' : 'text-ink-muted')
const deltaColor = (d) => (d > 0 ? C.good : d < 0 ? C.critical : C.inkMuted)
const fmtDelta = (d) => `${d > 0 ? '+' : ''}${d}`

const W = 760
const H = 220
const PAD = { t: 16, r: 16, b: 26, l: 34 }
const innerW = W - PAD.l - PAD.r
const innerH = H - PAD.t - PAD.b

const fmtDate = (s) => {
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ScoreTrend({ history }) {
  const [hover, setHover] = useState(null)

  const data = (history ?? []).slice().sort((a, b) => new Date(a.generated_at) - new Date(b.generated_at))
  const n = data.length

  const x = (i) => (n <= 1 ? PAD.l + innerW / 2 : PAD.l + (innerW * i) / (n - 1))
  const y = (score) => PAD.t + innerH * (1 - Math.max(0, Math.min(100, score)) / 100)
  const step = n <= 1 ? innerW : innerW / (n - 1)

  const onMove = (e) => {
    if (!n) return
    const rect = e.currentTarget.getBoundingClientRect()
    const vbX = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.max(0, Math.min(n - 1, Math.round((vbX - PAD.l) / step)))
    setHover(i)
  }

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(d.score).toFixed(1)}`).join(' ')
  const areaPath = n
    ? `${linePath} L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`
    : ''

  const latest = n ? data[n - 1] : null
  const latestVar = n > 1 ? explainVariation(data[n - 1], data[n - 2]) : null
  const hovered = hover != null && data[hover] ? data[hover] : null
  const hoveredVar = hover > 0 ? explainVariation(data[hover], data[hover - 1]) : null

  // One entry per run that actually moved the score (newest first), so the
  // manager reads *why* the curve bends, not just that it did.
  const changelog = []
  for (let i = n - 1; i >= 1; i--) {
    const v = explainVariation(data[i], data[i - 1])
    if (v && v.cause !== 'aucun changement') changelog.push({ ...v, point: data[i] })
  }

  return (
    <section className="bg-surface border border-line rounded-xl p-5 mb-6">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-ink-secondary" aria-hidden="true" />
          <h2 className="font-semibold text-sm">Tendance du Vibe Security Score</h2>
        </div>
        {latest && (
          <div className="text-right">
            <span className="text-xs text-ink-muted">
              {n} run{n > 1 ? 's' : ''} · dernier{' '}
              <span className="font-medium" style={{ color: gradeColor(latest.grade) }}>
                {latest.grade} ({latest.score}/100)
              </span>
            </span>
            {latestVar && (
              <p className={`text-xs font-medium ${deltaClass(latestVar.delta)}`}>
                {deltaArrow(latestVar.delta)} {fmtDelta(latestVar.delta)} pts{' '}
                <span className="text-ink-muted font-normal">— {latestVar.cause}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {n === 0 ? (
        <p className="text-sm text-ink-secondary py-6 text-center">
          Pas encore d'historique — la tendance se remplit à chaque run du gate.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 'auto' }}
          role="img"
          aria-label={`Évolution du score sur ${n} runs, dernier ${latest.score} sur 100`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity="0.28" />
              <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grade threshold gridlines */}
          {BANDS.map((b) => (
            <g key={b.grade}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(b.floor)}
                y2={y(b.floor)}
                stroke={C.line}
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <text x={PAD.l - 6} y={y(b.floor) + 3} textAnchor="end" fontSize="9" fill={C.inkMuted}>
                {b.grade}
              </text>
            </g>
          ))}
          {/* Y baseline labels */}
          <text x={PAD.l - 6} y={y(0) + 3} textAnchor="end" fontSize="9" fill={C.inkMuted}>0</text>

          {/* Area + line */}
          {n > 1 && <path d={areaPath} fill="url(#scoreFill)" />}
          {n > 1 && <path d={linePath} fill="none" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" />}

          {/* Points */}
          {data.map((d, i) => (
            <circle
              key={d.head_sha ?? d.sha ?? i}
              cx={x(i)}
              cy={y(d.score)}
              r={hover === i ? 5 : 3.5}
              fill={gradeColor(d.grade)}
              stroke={C.surface}
              strokeWidth="2"
            />
          ))}

          {/* X endpoints */}
          <text x={PAD.l} y={H - 8} textAnchor="start" fontSize="9" fill={C.inkMuted}>
            {fmtDate(data[0].generated_at)}
          </text>
          {n > 1 && (
            <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="9" fill={C.inkMuted}>
              {fmtDate(data[n - 1].generated_at)}
            </text>
          )}

          {/* Hover crosshair + tooltip */}
          {hovered && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={y(0)} stroke={C.inkMuted} strokeWidth="1" strokeDasharray="2 3" />
              {(() => {
                const tw = 168
                const th = hoveredVar ? 62 : 46
                const tx = Math.min(W - PAD.r - tw, Math.max(PAD.l, x(hover) - tw / 2))
                const ty = Math.max(PAD.t, y(hovered.score) - th - 10)
                return (
                  <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)})`}>
                    <rect width={tw} height={th} rx="6" fill={C.surface} stroke={C.line} />
                    <text x="10" y="17" fontSize="11" fill={C.ink} fontWeight="600">
                      <tspan fill={gradeColor(hovered.grade)}>{hovered.grade}</tspan>
                      <tspan fill={C.inkSecondary}> · {hovered.score}/100</tspan>
                    </text>
                    <text x="10" y="33" fontSize="9" fill={C.inkMuted} fontFamily="ui-monospace, monospace">
                      {(hovered.head_sha ?? hovered.sha ?? '').slice(0, 7)} · {fmtDate(hovered.generated_at)}
                    </text>
                    {hoveredVar && (
                      <text x="10" y="49" fontSize="9" fill={C.inkSecondary}>
                        <tspan fill={deltaColor(hoveredVar.delta)} fontWeight="600">
                          {deltaArrow(hoveredVar.delta)} {fmtDelta(hoveredVar.delta)} pts
                        </tspan>
                        <tspan> · {hoveredVar.cause.length > 22 ? hoveredVar.cause.slice(0, 21) + '…' : hoveredVar.cause}</tspan>
                      </text>
                    )}
                  </g>
                )
              })()}
            </g>
          )}
        </svg>
      )}

      {/* What actually moved the score — the "why" behind the curve. */}
      {changelog.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">Ce qui a fait bouger le score</p>
          <ul className="space-y-1.5">
            {changelog.slice(0, 6).map((v) => (
              <li key={v.point.head_sha ?? v.point.sha} className="flex items-center gap-3 text-xs">
                <span className={`font-medium tabular-nums w-12 shrink-0 text-right ${deltaClass(v.delta)}`}>
                  {deltaArrow(v.delta)} {fmtDelta(v.delta)}
                </span>
                <span className="text-ink-secondary flex-1 min-w-0 truncate">{v.cause}</span>
                <span className="font-mono text-ink-muted shrink-0">
                  {(v.point.head_sha ?? v.point.sha ?? '').slice(0, 7)}
                </span>
                <span className="text-ink-muted shrink-0 w-14 text-right">{fmtDate(v.point.generated_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
