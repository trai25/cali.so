import { spawnSync } from 'node:child_process'
import { globSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { expect, it } from 'vitest'

const CSP_FALLBACK_WARNING =
  'This environment does not allow eval - using default writer as fallback'

it('warns only once when TypeGPU falls back under a strict CSP', () => {
  const [compiledIoRelativePath] = globSync(
    'node_modules/.pnpm/typegpu@*/node_modules/typegpu/data/compiledIO.js',
    { cwd: process.cwd() },
  )

  expect(compiledIoRelativePath).toBeDefined()
  const compiledIoPath = resolve(process.cwd(), compiledIoRelativePath!)

  const script = `
    const { getCompiledWriter } = await import(${JSON.stringify(pathToFileURL(compiledIoPath!).href)})
    getCompiledWriter({})
    getCompiledWriter({})
    getCompiledWriter({})
  `
  const result = spawnSync(
    process.execPath,
    [
      '--disallow-code-generation-from-strings',
      '--input-type=module',
      '--eval',
      script,
    ],
    { encoding: 'utf8' },
  )

  expect(result.status, result.stderr).toBe(0)
  expect(result.stderr.match(new RegExp(CSP_FALLBACK_WARNING, 'g'))).toHaveLength(1)
})
