import type { GitHubSnapshot, SocialSnapshot } from '~/components/social-cards'

import bakedGithub from '~/content/github.json'
import bakedSocial from '~/content/social.json'

export interface SocialData {
  x: SocialSnapshot
  telegram: SocialSnapshot
  youtube: SocialSnapshot
}

// Live social numbers with ISR caching: fetched at runtime through the
// Next data cache (revalidate literals below), so counts refresh without
// a rebuild. The baked content/*.json snapshots stay as fallback seeds —
// builds and outages degrade to the last committed numbers instead of an
// empty card. X has no public endpoint; its count stays manual in
// content/social.json.

export async function getGitHub(): Promise<GitHubSnapshot> {
  try {
    const [contrib, user] = await Promise.all([
      fetch('https://github-contributions-api.jogruber.de/v4/CaliCastle?y=last', {
        next: { revalidate: 21600, tags: ['social-live'] }, // 6h
      }).then((r) => {
        if (!r.ok) throw new Error(`contributions ${r.status}`)
        return r.json()
      }),
      fetch('https://api.github.com/users/CaliCastle', {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'cali.so' },
        next: { revalidate: 21600, tags: ['social-live'] }, // 6h
      }).then((r) => {
        if (!r.ok) throw new Error(`user ${r.status}`)
        return r.json()
      }),
    ])
    const days: Array<{ date: string; level: number }> = contrib.contributions
    return {
      user: 'CaliCastle',
      followers: user.followers,
      total: contrib.total.lastYear,
      to: days[days.length - 1].date,
      levels: days.map((d) => d.level).join(''),
    }
  } catch {
    return bakedGithub as GitHubSnapshot
  }
}

export async function getSocial(): Promise<SocialData> {
  const social = bakedSocial as SocialData
  try {
    const html = await fetch('https://www.youtube.com/@calicastle', {
      headers: { 'accept-language': 'en-US' },
      next: { revalidate: 43200, tags: ['social-live'] }, // 12h
    }).then((r) => {
      if (!r.ok) throw new Error(`youtube ${r.status}`)
      return r.text()
    })
    const match = html.match(/([\d.,]+[KM]?) subscribers/)
    if (match) {
      return { ...social, youtube: { ...social.youtube, followers: match[1] } }
    }
  } catch {
    /* fall through to the baked seed */
  }
  return social
}
