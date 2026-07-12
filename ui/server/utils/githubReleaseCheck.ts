import { normalizeVersionTag } from '../../shared/version'

export type LatestReleaseResult = { version: string } | { error: string }

/** GitHub's API 403s any request without a User-Agent header. */
const GITHUB_HEADERS = { 'User-Agent': 'FluidSender', Accept: 'application/vnd.github+json' }

export async function getLatestGithubRelease(owner: string, repo: string): Promise<LatestReleaseResult> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, { headers: GITHUB_HEADERS })
    if (!res.ok) return { error: `GitHub API returned ${res.status}` }
    const data = (await res.json()) as { tag_name?: string }
    if (!data.tag_name) return { error: 'GitHub release response had no tag_name' }
    return { version: normalizeVersionTag(data.tag_name) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' }
  }
}

/** Calendar-day comparison (not a rolling 24h window) — a check at 23:59 and one at 00:01 count as different days. */
export function isSameCalendarDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
