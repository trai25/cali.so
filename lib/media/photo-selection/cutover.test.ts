import { access, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

const repositoryRoot = new URL('../../../', import.meta.url)
const selectedOriginals = [
  {
    fileName: 'IMG_7560.HEIC',
    checksum: '88a49da230bb852105ed25e9135cd076d2d515810767a57f79839c6933fe4f49',
  },
  {
    fileName: 'IMG_20250508_003134_Original.JPG',
    checksum: '1825bebd811ee2ff341932b96967bd13a0102e1aec90a699af981eaec8991c51',
  },
] as const

describe('Issue #96 photo release cutover', () => {
  it('replaces the six static photos with exactly two selected Originals', async () => {
    const runbook = await readFile(
      new URL('docs/media/photo-release-cutover.md', repositoryRoot),
      'utf8',
    )
    const fixedInputRows = runbook.match(/^\| [12] \| `[^`]+` \| `[0-9a-f]{64}` \|$/gm)

    expect(fixedInputRows).toHaveLength(selectedOriginals.length)
    for (const original of selectedOriginals) {
      expect(runbook).toContain(
        `\`${original.fileName}\` | \`${original.checksum}\``,
      )
    }

    const removedPaths = [
      'lib/photos.ts',
      'public/images/photos/photo-1.jpg',
      'public/images/photos/photo-2.jpg',
      'public/images/photos/photo-3.png',
      'public/images/photos/photo-4.jpg',
      'public/images/photos/photo-5.jpg',
      'public/images/photos/photo-6.jpg',
    ]
    await Promise.all(
      removedPaths.map(async (path) => {
        await expect(access(new URL(path, repositoryRoot))).rejects.toThrow()
      }),
    )

    const consumers = await Promise.all(
      ['app/page.tsx', 'app/photos/page.tsx'].map((path) =>
        readFile(new URL(path, repositoryRoot), 'utf8'),
      ),
    )
    for (const consumer of consumers) {
      expect(consumer).toContain('getPublishedPhotoSelection')
      expect(consumer).not.toMatch(/lib\/photos|\/images\/photos\//)
    }
  })
})
