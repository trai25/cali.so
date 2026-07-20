import { describe, expect, it } from 'vitest'

import { usePGliteTestClient } from './pglite'

// The two tests are order-dependent by design: the first dirties every
// table, the second proves each test starts from post-migration state.
describe('usePGliteTestClient', () => {
  const getClient = usePGliteTestClient(['../testing/fixtures/seeded-migration.sql'])

  it('serves a booted client with migrations applied', async () => {
    const client = getClient()

    await client.query("insert into plain (note) values ('scratch')")
    await client.query('delete from seeded_lookup where id = 2')

    const plain = await client.query<{ n: number }>(
      'select count(*)::int as n from plain',
    )
    expect(plain.rows[0]!.n).toBe(1)
  })

  it('resets to post-migration state between tests, seeds included', async () => {
    const client = getClient()

    const plain = await client.query<{ n: number }>(
      'select count(*)::int as n from plain',
    )
    expect(plain.rows[0]!.n).toBe(0)

    const seeded = await client.query<{ id: number; label: string }>(
      'select id, label from seeded_lookup order by id',
    )
    expect(seeded.rows).toEqual([
      { id: 1, label: 'alpha' },
      { id: 2, label: 'beta' },
    ])

    // identities restart too: the first insert lands back on id 1
    const inserted = await client.query<{ id: number }>(
      "insert into plain (note) values ('fresh') returning id",
    )
    expect(inserted.rows[0]!.id).toBe(1)
  })
})
