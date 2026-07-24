import { supabase, isSupabaseConfigured } from './supabaseClient'
import { getRepo } from './repo'
import { fetchGateReport as ghGateReport, fetchGateHistory as ghGateHistory } from './githubApi'

// Provider-agnostic reports source. Primary path is the central Supabase
// `gate_reports` table (written by the gate container, any CI/provider). If
// Supabase isn't configured, the table doesn't exist yet, or it has no row
// for this repo, we fall back to the legacy GitHub `gate-reports` branch — so
// migration is seamless and GitHub-only setups keep working.

export async function getLatestReport(repoFull) {
  const full = repoFull || getRepo().full
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('gate_reports')
        .select('report')
        .eq('repo_full', full)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!error && data?.report) return data.report
    } catch { /* table missing / offline → fall back */ }
  }
  return ghGateReport(full)
}

export async function getHistory(repoFull) {
  const full = repoFull || getRepo().full
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('gate_reports')
        .select('head_sha, score, grade, blocking_count, advisory_count, generated_at, report')
        .eq('repo_full', full)
        .order('generated_at', { ascending: true })
        .limit(50)
      if (!error && Array.isArray(data) && data.length) {
        return data.map((r) => ({
          head_sha: r.head_sha,
          sha: r.head_sha,
          score: r.score,
          grade: r.grade,
          blocking_count: r.blocking_count,
          advisory_count: r.advisory_count,
          generated_at: r.generated_at,
          jobs: r.report?.jobs,
        }))
      }
    } catch { /* fall back */ }
  }
  return ghGateHistory(full)
}
