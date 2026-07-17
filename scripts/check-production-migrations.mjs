import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const destructiveOperations = [
  ['DROP TABLE', /\bDROP\s+TABLE\b/giu],
  ['DROP SCHEMA', /\bDROP\s+SCHEMA\b/giu],
  ['DROP TYPE', /\bDROP\s+TYPE\b/giu],
  ['DROP DOMAIN', /\bDROP\s+DOMAIN\b/giu],
  ['DROP SEQUENCE', /\bDROP\s+SEQUENCE\b/giu],
  ['DROP VIEW', /\bDROP\s+(?:MATERIALIZED\s+)?VIEW\b/giu],
  ['DROP FUNCTION', /\bDROP\s+(?:FUNCTION|PROCEDURE)\b/giu],
  ['TRUNCATE', /\bTRUNCATE(?:\s+TABLE)?\b/giu],
  ['DELETE', /\bDELETE\s+FROM\b/giu],
  ['DROP COLUMN', /\bALTER\s+TABLE\b[^;]*?\bDROP\s+COLUMN\b/gisu],
  ['RENAME', /\bALTER\s+(?:TABLE|TYPE|DOMAIN)\b[^;]*?\bRENAME\b/gisu],
  [
    'ALTER COLUMN TYPE',
    /\bALTER\s+TABLE\b[^;]*?\bALTER\s+COLUMN\b[^;]*?\bTYPE\b/gisu,
  ],
  [
    'SET NOT NULL',
    /\bALTER\s+TABLE\b[^;]*?\bALTER\s+COLUMN\b[^;]*?\bSET\s+NOT\s+NULL\b/gisu,
  ],
  [
    'DROP DEFAULT',
    /\bALTER\s+TABLE\b[^;]*?\bALTER\s+COLUMN\b[^;]*?\bDROP\s+DEFAULT\b/gisu,
  ],
  ['DROP CONSTRAINT', /\bALTER\s+TABLE\b[^;]*?\bDROP\s+CONSTRAINT\b/gisu],
  ['SET SCHEMA', /\bALTER\s+TABLE\b[^;]*?\bSET\s+SCHEMA\b/gisu],
]

const reviewedInitialMigrationDigests = new Map([
  [
    'db/migrations/0001_ama_owner_auth.sql',
    '839932b28e9c4bf079a03b911f93a17ee52ca9360989d57f5b9bb19dfe07885b',
  ],
  [
    'db/migrations/0002_ama_availability.sql',
    'd231874f888a5cca3808c0a9f1fb46bfd85de3ea48163e61ae1e91a49438efbe',
  ],
  [
    'db/migrations/0003_ama_google_calendar.sql',
    '2bc0a27f0aaf5bbc13f09634c6e38455be72ae32aacbe1e743477bde7695d5d9',
  ],
  [
    'db/migrations/0004_ama_google_oauth.sql',
    'b44fdb68af6b0797c45643f1399dfb9aa08eec24be09ff94cb569f7ac11f6de0',
  ],
  [
    'db/migrations/0005_media_catalog.sql',
    '59d9c19e2beea74ea071596ed71f08d4cc8f5c872c766e0fd6e5cbd05e8220c5',
  ],
  [
    'db/migrations/0006_photo_selection.sql',
    '6f0070cc9cc8baa09d573d7c1bfe5438d482c13d543cc01840268b5bf6f75da5',
  ],
  [
    'db/migrations/0007_photo_publication_revision.sql',
    '2f9e730dfa226e9abbd39b527b9d3ff6bbca540a148247ba63e4e15d7fabf3d3',
  ],
  [
    'db/migrations/0008_media_purge_progress.sql',
    '5e243a9730d4265c8c38ba021abb78aa6d3021bdc16581c4d08a9b154cfae068',
  ],
  [
    'db/migrations/0009_media_catalog_state.sql',
    '4093b49d5cbd10c5d7a856d7a259b5e7efe6086ab84c33ee1c4857cb03d700bf',
  ],
  [
    'db/migrations/0010_rate_limit_windows.sql',
    '02868db5c548947ccd50bd8fa2a84c0507128bc97d1c5932dca990fb3f7cc289',
  ],
])

function maskRange(characters, start, end) {
  for (let index = start; index < end; index += 1) {
    if (characters[index] !== '\n') characters[index] = ' '
  }
}

function sqlWithoutCommentsAndLiterals(sql) {
  const characters = [...sql]
  let index = 0

  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      const stop = end === -1 ? sql.length : end
      maskRange(characters, index, stop)
      index = stop
      continue
    }
    if (sql.startsWith('/*', index)) {
      let depth = 1
      let end = index + 2
      while (end < sql.length && depth > 0) {
        if (sql.startsWith('/*', end)) {
          depth += 1
          end += 2
        } else if (sql.startsWith('*/', end)) {
          depth -= 1
          end += 2
        } else {
          end += 1
        }
      }
      maskRange(characters, index, end)
      index = end
      continue
    }
    if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index]
      let end = index + 1
      while (end < sql.length) {
        if (sql[end] === quote && sql[end + 1] === quote) {
          end += 2
        } else if (sql[end] === quote) {
          end += 1
          break
        } else {
          end += 1
        }
      }
      maskRange(characters, index, end)
      index = end
      continue
    }
    if (sql[index] === '$') {
      const delimiter = sql
        .slice(index)
        .match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/u)?.[0]
      if (delimiter) {
        const closing = sql.indexOf(delimiter, index + delimiter.length)
        const end = closing === -1 ? sql.length : closing + delimiter.length
        maskRange(characters, index, end)
        index = end
        continue
      }
    }
    index += 1
  }
  return characters.join('')
}

export function destructiveMigrationFindings(sql) {
  const searchable = sqlWithoutCommentsAndLiterals(sql)
  const findings = []
  for (const [operation, expression] of destructiveOperations) {
    expression.lastIndex = 0
    for (const match of searchable.matchAll(expression)) {
      findings.push({
        operation,
        line: searchable.slice(0, match.index).split('\n').length,
        index: match.index,
      })
    }
  }
  return findings
    .sort((left, right) => left.index - right.index)
    .map(({ index: _index, ...finding }) => finding)
}

export function productionMigrationFindings(path, sql) {
  const reviewedDigest = reviewedInitialMigrationDigests.get(path)
  if (reviewedDigest) {
    const digest = createHash('sha256').update(sql).digest('hex')
    if (digest !== reviewedDigest) {
      throw new Error(`Reviewed initial migration is immutable: ${path}`)
    }
    return []
  }
  return destructiveMigrationFindings(sql)
}

export function parseChangedMigrations(output) {
  const added = []
  for (const line of output.trim().split('\n').filter(Boolean)) {
    const [status, ...paths] = line.split('\t')
    const migrationPaths = paths.filter((path) =>
      /^db\/migrations\/[^/]+\.sql$/u.test(path),
    )
    if (migrationPaths.length === 0) continue
    if (status !== 'A') {
      throw new Error(
        `Applied migration files are immutable: ${migrationPaths.join(', ')}`,
      )
    }
    added.push(...migrationPaths)
  }
  return added
}

export function migrationPathsInRepository(fileNames) {
  return fileNames
    .filter((name) => /^[^/]+\.sql$/u.test(name))
    .sort()
    .map((name) => `db/migrations/${name}`)
}

function assertCommit(value, name) {
  if (!/^[0-9a-f]{40}$/iu.test(value ?? '')) {
    throw new Error(`${name} must be a full Git commit SHA`)
  }
  if (/^0{40}$/u.test(value)) {
    throw new Error(`${name} cannot be the empty Git commit SHA`)
  }
  return value
}

export function migrationDiffArguments(base, head) {
  return [
    'diff',
    '--name-status',
    '--diff-filter=ACDMRT',
    `${base}..${head}`,
    '--',
    'db/migrations/*.sql',
  ]
}

async function main() {
  const base = assertCommit(process.argv[2], 'Base')
  const head = assertCommit(process.argv[3], 'Head')
  const changed = execFileSync('git', migrationDiffArguments(base, head), {
    encoding: 'utf8',
  })
  const changedMigrations = parseChangedMigrations(changed)
  const migrations = migrationPathsInRepository(await readdir('db/migrations'))
  const unsafe = []
  for (const path of migrations) {
    const sql = await readFile(path, 'utf8')
    for (const finding of productionMigrationFindings(path, sql)) {
      unsafe.push(`${path}:${finding.line} ${finding.operation}`)
    }
  }
  if (unsafe.length > 0) {
    throw new Error(
      `Production migrations must use an expand-only release:\n${unsafe.join('\n')}`,
    )
  }
  console.log(
    `Checked ${migrations.length} Production migration(s); ${changedMigrations.length} added in this release.`,
  )
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main()
}
