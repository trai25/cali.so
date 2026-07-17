import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const reviewedMigrationDigests = new Map([
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

function dollarDelimiterAt(sql, index) {
  return sql
    .slice(index)
    .match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/u)?.[0]
}

function skipQuoted(sql, index, quote) {
  let cursor = index + 1
  while (cursor < sql.length) {
    if (sql[cursor] === quote && sql[cursor + 1] === quote) {
      cursor += 2
    } else if (sql[cursor] === quote) {
      return cursor + 1
    } else {
      cursor += 1
    }
  }
  return sql.length
}

function skipBlockComment(sql, index) {
  let cursor = index + 2
  let depth = 1
  while (cursor < sql.length && depth > 0) {
    if (sql.startsWith('/*', cursor)) {
      depth += 1
      cursor += 2
    } else if (sql.startsWith('*/', cursor)) {
      depth -= 1
      cursor += 2
    } else {
      cursor += 1
    }
  }
  return cursor
}

function firstTokenLine(sql, initialLine) {
  let line = initialLine
  let index = 0
  while (index < sql.length) {
    if (/\s/u.test(sql[index])) {
      if (sql[index] === '\n') line += 1
      index += 1
      continue
    }
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      index = end === -1 ? sql.length : end
      continue
    }
    if (sql.startsWith('/*', index)) {
      const end = skipBlockComment(sql, index)
      line += sql.slice(index, end).split('\n').length - 1
      index = end
      continue
    }
    break
  }
  return line
}

function splitSqlStatements(sql) {
  const statements = []
  let start = 0
  let startLine = 1
  let line = 1
  let index = 0

  while (index < sql.length) {
    if (sql[index] === '\n') {
      line += 1
      index += 1
      continue
    }
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      index = end === -1 ? sql.length : end
      continue
    }
    if (sql.startsWith('/*', index)) {
      const end = skipBlockComment(sql, index)
      line += sql.slice(index, end).split('\n').length - 1
      index = end
      continue
    }
    if (sql[index] === "'" || sql[index] === '"') {
      const end = skipQuoted(sql, index, sql[index])
      line += sql.slice(index, end).split('\n').length - 1
      index = end
      continue
    }
    if (sql[index] === '$') {
      const delimiter = dollarDelimiterAt(sql, index)
      if (delimiter) {
        const closing = sql.indexOf(delimiter, index + delimiter.length)
        const end = closing === -1 ? sql.length : closing + delimiter.length
        line += sql.slice(index, end).split('\n').length - 1
        index = end
        continue
      }
    }
    if (sql[index] === ';') {
      const statementSql = sql.slice(start, index + 1)
      statements.push({
        sql: statementSql,
        line: firstTokenLine(statementSql, startLine),
      })
      start = index + 1
      startLine = line
    }
    index += 1
  }

  if (sql.slice(start).trim()) {
    const statementSql = sql.slice(start)
    statements.push({
      sql: statementSql,
      line: firstTokenLine(statementSql, startLine),
    })
  }
  return statements
}

function sqlTokens(sql) {
  const tokens = []
  let depth = 0
  let index = 0

  while (index < sql.length) {
    if (/\s/u.test(sql[index]) || sql[index] === ';') {
      index += 1
      continue
    }
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      index = end === -1 ? sql.length : end
      continue
    }
    if (sql.startsWith('/*', index)) {
      index = skipBlockComment(sql, index)
      continue
    }
    if (sql[index] === "'") {
      tokens.push({ value: '<LITERAL>', type: 'literal', depth })
      index = skipQuoted(sql, index, "'")
      continue
    }
    if (sql[index] === '"') {
      tokens.push({ value: '<IDENTIFIER>', type: 'identifier', depth })
      index = skipQuoted(sql, index, '"')
      continue
    }
    if (sql[index] === '$') {
      const delimiter = dollarDelimiterAt(sql, index)
      if (delimiter) {
        tokens.push({ value: '<LITERAL>', type: 'literal', depth })
        const closing = sql.indexOf(delimiter, index + delimiter.length)
        index = closing === -1 ? sql.length : closing + delimiter.length
        continue
      }
    }
    if (sql[index] === '(') {
      tokens.push({ value: '(', type: 'punctuation', depth })
      depth += 1
      index += 1
      continue
    }
    if (sql[index] === ')') {
      depth = Math.max(0, depth - 1)
      tokens.push({ value: ')', type: 'punctuation', depth })
      index += 1
      continue
    }
    const number = sql
      .slice(index)
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?/iu)?.[0]
    if (number) {
      tokens.push({ value: number.toUpperCase(), type: 'number', depth })
      index += number.length
      continue
    }
    if (sql[index] === '.' || sql[index] === ',') {
      tokens.push({ value: sql[index], type: 'punctuation', depth })
      index += 1
      continue
    }
    const word = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/u)?.[0]
    if (word) {
      tokens.push({ value: word.toUpperCase(), type: 'word', depth })
      index += word.length
      continue
    }
    tokens.push({ value: sql[index], type: 'operator', depth })
    index += 1
  }
  return tokens
}

function hasSequence(tokens, values, depth) {
  return tokens.some((token, index) => {
    if (depth !== undefined && token.depth !== depth) return false
    return values.every((value, offset) => {
      const candidate = tokens[index + offset]
      return candidate?.depth === token.depth && candidate.value === value
    })
  })
}

function withoutOuterParentheses(tokens) {
  let expression = tokens
  while (
    expression[0]?.value === '(' &&
    expression.at(-1)?.value === ')'
  ) {
    let balance = 0
    let wrapsWholeExpression = true
    for (let index = 0; index < expression.length; index += 1) {
      if (expression[index].value === '(') balance += 1
      if (expression[index].value === ')') balance -= 1
      if (balance === 0 && index < expression.length - 1) {
        wrapsWholeExpression = false
        break
      }
    }
    if (!wrapsWholeExpression || balance !== 0) break
    expression = expression.slice(1, -1)
  }
  return expression
}

function isProvablyNonNullDefault(tokens) {
  const expression = withoutOuterParentheses(tokens)
  if (expression.length === 1) {
    const [token] = expression
    return (
      token.type === 'literal' ||
      token.type === 'number' ||
      [
        'CURRENT_DATE',
        'CURRENT_TIME',
        'CURRENT_TIMESTAMP',
        'FALSE',
        'LOCALTIME',
        'LOCALTIMESTAMP',
        'TRUE',
      ].includes(token.value)
    )
  }
  if (
    expression.length === 2 &&
    ['+', '-'].includes(expression[0].value) &&
    expression[1].type === 'number'
  ) {
    return true
  }
  return (
    expression.length === 3 &&
    ['GEN_RANDOM_UUID', 'NOW'].includes(expression[0].value) &&
    expression[1].value === '(' &&
    expression[2].value === ')'
  )
}

function tableAction(tokens) {
  if (tokens[0]?.value !== 'ALTER' || tokens[1]?.value !== 'TABLE') return []
  let index = 2
  if (tokens[index]?.value === 'ONLY') index += 1
  if (tokens[index]?.value === 'IF' && tokens[index + 1]?.value === 'EXISTS') {
    index += 2
  }
  if (!['word', 'identifier'].includes(tokens[index]?.type)) return []
  index += 1
  while (
    tokens[index]?.value === '.' &&
    ['word', 'identifier'].includes(tokens[index + 1]?.type)
  ) {
    index += 2
  }
  return tokens.slice(index)
}

function specificUnsafeOperation(tokens) {
  if (tokens[0]?.value === 'DROP' && tokens[1]?.type === 'word') {
    return `DROP ${tokens[1].value}`
  }
  if (tokens[0]?.value === 'TRUNCATE') return 'TRUNCATE'
  if (tokens[0]?.value === 'DELETE') return 'DELETE'

  const action = tableAction(tokens)
  if (action[0]?.value === 'DROP' && action[1]?.value === 'COLUMN') {
    return 'DROP COLUMN'
  }
  if (action[0]?.value === 'DROP' && action[1]?.value === 'CONSTRAINT') {
    return 'DROP CONSTRAINT'
  }
  if (action[0]?.value === 'RENAME') return 'RENAME'
  if (action[0]?.value === 'SET' && action[1]?.value === 'SCHEMA') {
    return 'SET SCHEMA'
  }
  if (action[0]?.value === 'ALTER' && action[1]?.value === 'COLUMN') {
    if (hasSequence(action, ['TYPE'], 0)) return 'ALTER COLUMN TYPE'
    if (hasSequence(action, ['SET', 'NOT', 'NULL'], 0)) return 'SET NOT NULL'
    if (hasSequence(action, ['DROP', 'DEFAULT'], 0)) return 'DROP DEFAULT'
  }
  return 'UNRECOGNIZED STATEMENT'
}

function allowedCreate(tokens) {
  if (tokens[0]?.value !== 'CREATE') return false
  if (
    ['TABLE', 'TYPE', 'SEQUENCE', 'VIEW', 'FUNCTION', 'INDEX'].includes(
      tokens[1]?.value,
    )
  ) {
    return true
  }
  return tokens[1]?.value === 'MATERIALIZED' && tokens[2]?.value === 'VIEW'
}

function alterTableFinding(tokens) {
  const action = tableAction(tokens)
  if (action.length === 0) return 'UNRECOGNIZED STATEMENT'
  if (action.some((token) => token.value === ',' && token.depth === 0)) {
    return 'UNRECOGNIZED STATEMENT'
  }

  if (action[0]?.value === 'ADD' && action[1]?.value === 'COLUMN') {
    const definition = action.slice(3)
    const hasNotNull = hasSequence(definition, ['NOT', 'NULL'], 0)
    const defaultIndex = definition.findIndex(
      (token) => token.depth === 0 && token.value === 'DEFAULT',
    )
    const trailingNotNullIndex = definition.findIndex((token, index) => {
      return (
        index > defaultIndex &&
        token.depth === 0 &&
        token.value === 'NOT' &&
        definition[index + 1]?.depth === 0 &&
        definition[index + 1]?.value === 'NULL'
      )
    })
    const defaultExpression =
      defaultIndex === -1
        ? []
        : definition.slice(
            defaultIndex + 1,
            trailingNotNullIndex === -1
              ? definition.length
              : trailingNotNullIndex,
          )
    const hasSafeDefault =
      defaultIndex !== -1 && isProvablyNonNullDefault(defaultExpression)
    if (hasNotNull && !hasSafeDefault) {
      return 'ADD COLUMN NOT NULL WITHOUT SAFE DEFAULT'
    }
    if (defaultIndex !== -1 && !hasSafeDefault) {
      return 'ADD COLUMN REQUIRES SAFE DEFAULT'
    }
    if (
      definition.some(
        (token) =>
          token.depth === 0 &&
          [
            'CHECK',
            'CONSTRAINT',
            'GENERATED',
            'IDENTITY',
            'PRIMARY',
            'REFERENCES',
            'UNIQUE',
          ].includes(token.value),
      )
    ) {
      return 'UNRECOGNIZED STATEMENT'
    }
    return undefined
  }

  if (action[0]?.value === 'ADD' && action[1]?.value === 'CONSTRAINT') {
    return 'ADD CONSTRAINT REQUIRES REVIEW'
  }

  if (
    action[0]?.value === 'VALIDATE' &&
    action[1]?.value === 'CONSTRAINT' &&
    action.length === 3
  ) {
    return undefined
  }

  if (
    action[0]?.value === 'ALTER' &&
    action[1]?.value === 'COLUMN' &&
    action[3]?.value === 'SET' &&
    action[4]?.value === 'DEFAULT' &&
    action.length > 5
  ) {
    return isProvablyNonNullDefault(action.slice(5))
      ? undefined
      : 'SET DEFAULT REQUIRES SAFE VALUE'
  }

  return specificUnsafeOperation(tokens)
}

export function expandOnlyMigrationFindings(sql) {
  const findings = []
  for (const statement of splitSqlStatements(sql)) {
    const tokens = sqlTokens(statement.sql)
    if (tokens.length === 0 || allowedCreate(tokens)) continue
    const operation =
      tokens[0]?.value === 'ALTER' && tokens[1]?.value === 'TABLE'
        ? alterTableFinding(tokens)
        : specificUnsafeOperation(tokens)
    if (operation) findings.push({ operation, line: statement.line })
  }
  return findings
}

export function productionMigrationFindings(path, sql) {
  const reviewedDigest = reviewedMigrationDigests.get(path)
  if (reviewedDigest) {
    const digest = createHash('sha256').update(sql).digest('hex')
    if (digest !== reviewedDigest) {
      throw new Error(`Reviewed initial migration is immutable: ${path}`)
    }
    return []
  }
  return expandOnlyMigrationFindings(sql)
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
