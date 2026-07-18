import { CheckCircle2, XCircle, Clock, MinusCircle, AlertTriangle } from 'lucide-react'

// Status color never carries meaning alone: every badge pairs icon + label.
const STATUS = {
  success: { label: 'Passed', color: 'text-status-good', Icon: CheckCircle2 },
  failure: { label: 'Failed', color: 'text-status-critical', Icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'text-ink-muted', Icon: MinusCircle },
  skipped: { label: 'Skipped', color: 'text-ink-muted', Icon: MinusCircle },
  in_progress: { label: 'Running', color: 'text-status-warning', Icon: Clock },
  queued: { label: 'Queued', color: 'text-ink-muted', Icon: Clock },
  unknown: { label: 'Unknown', color: 'text-status-serious', Icon: AlertTriangle },
}

export function statusOf(run) {
  if (!run) return 'unknown'
  if (run.status === 'in_progress' || run.status === 'queued') return run.status
  return STATUS[run.conclusion] ? run.conclusion : 'unknown'
}

export default function StatusBadge({ status, size = 'sm' }) {
  const { label, color, Icon } = STATUS[status] ?? STATUS.unknown
  const iconSize = size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs'
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${color} ${textSize}`}>
      <Icon className={iconSize} aria-hidden="true" />
      {label}
    </span>
  )
}
