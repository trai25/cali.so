import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deleteVercelBranchDeployments } from './delete-vercel-branch-deployments.mjs'

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test('deletes every paginated Preview deployment for one Git branch', async () => {
  const requests = []
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method ?? 'GET' })
    if (init.method === 'DELETE') {
      return response({ state: 'DELETED' })
    }

    const cursor = new URL(url).searchParams.get('until')
    if (!cursor) {
      return response({
        deployments: [
          {
            uid: 'dpl_first',
            meta: { githubCommitRef: 'feat/media-fix' },
          },
        ],
        pagination: { next: 1234 },
      })
    }
    return response({
      deployments: [
        {
          uid: 'dpl_second',
          meta: { githubCommitRef: 'feat/media-fix' },
        },
      ],
      pagination: { next: null },
    })
  }

  const deleted = await deleteVercelBranchDeployments({
    branch: 'feat/media-fix',
    projectId: 'prj_cali',
    teamId: 'team_cali',
    token: 'token',
    fetchImpl,
  })

  assert.deepEqual(deleted, ['dpl_first', 'dpl_second'])
  const listUrls = requests
    .filter(({ method }) => method === 'GET')
    .map(({ url }) => new URL(url))
  assert.equal(listUrls.length, 2)
  assert.equal(listUrls[0].searchParams.get('branch'), 'feat/media-fix')
  assert.equal(listUrls[0].searchParams.get('target'), 'preview')
  assert.equal(listUrls[1].searchParams.get('until'), '1234')
  assert.deepEqual(
    requests
      .filter(({ method }) => method === 'DELETE')
      .map(({ url }) => new URL(url).pathname),
    ['/v13/deployments/dpl_first', '/v13/deployments/dpl_second'],
  )
})

test('refuses reserved and mismatched branches before deleting deployments', async () => {
  const unexpectedFetch = () => {
    throw new Error('fetch should not run')
  }
  await assert.rejects(
    deleteVercelBranchDeployments({
      branch: 'main',
      projectId: 'prj_cali',
      teamId: 'team_cali',
      token: 'token',
      fetchImpl: unexpectedFetch,
    }),
    /reserved branch/,
  )

  await assert.rejects(
    deleteVercelBranchDeployments({
      branch: 'feat/media-fix',
      projectId: 'prj_cali',
      teamId: 'team_cali',
      token: 'token',
      fetchImpl: async () =>
        response({
          deployments: [{ uid: 'dpl_wrong', meta: { githubCommitRef: 'dev' } }],
          pagination: { next: null },
        }),
    }),
    /did not match Git branch/,
  )
})
