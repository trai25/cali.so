// Refreshes the YouTube subscriber count in content/social.json.
// (X follower count stays manual — no public endpoint worth scraping.)
//   node scripts/refresh-social.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const html = await (
  await fetch('https://www.youtube.com/@calicastle', {
    headers: { 'accept-language': 'en-US' },
  })
).text()
const match = html.match(/([\d.,]+[KM]?) subscribers/)
if (!match) throw new Error('subscriber count not found — YouTube markup changed?')

const social = JSON.parse(readFileSync('content/social.json', 'utf8'))
social.youtube.followers = match[1]
social.youtube.asOf = new Date().toISOString().slice(0, 7)
writeFileSync('content/social.json', JSON.stringify(social, null, 2) + '\n')
console.log('youtube subscribers:', match[1])
