// Refreshes content/github.json (contribution levels for the hover card).
//   node scripts/refresh-github.mjs
import { writeFileSync } from 'node:fs'

const res = await fetch('https://github-contributions-api.jogruber.de/v4/CaliCastle?y=last')
const data = await res.json()
const days = data.contributions
writeFileSync(
  'content/github.json',
  JSON.stringify(
    {
      user: 'CaliCastle',
      total: data.total.lastYear,
      from: days[0].date,
      to: days[days.length - 1].date,
      levels: days.map((d) => d.level).join(''),
    },
    null,
    2,
  ) + '\n',
)
console.log('saved', days.length, 'days')
