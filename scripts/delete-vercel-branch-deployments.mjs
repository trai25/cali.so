import { pathToFileURL } from 'node:url'

const reservedBranches = new Set(['dev', 'main'])

function required(value, name) {
  if (!value?.trim()) throw new Error(`Missing ${name}`)
  return value.trim()
}

async function vercelRequest(fetchImpl, url, token, init = {}) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  if (response.ok || (init.method === 'DELETE' && response.status === 404)) {
    return response.status === 404 ? null : response.json()
  }
  throw new Error(
    `Vercel deployment request failed with HTTP ${response.status}`,
  )
}

export async function deleteVercelBranchDeployments({
  branch,
  projectId,
  teamId,
  token,
  fetchImpl = fetch,
}) {
  const gitBranch = required(branch, 'GIT_BRANCH')
  if (reservedBranches.has(gitBranch)) {
    throw new Error(`Refusing to clean reserved branch: ${gitBranch}`)
  }
  if (/[\u0000-\u001f\u007f]/.test(gitBranch)) {
    throw new Error('Git branch contains control characters')
  }

  const project = required(projectId, 'VERCEL_PROJECT_ID')
  const team = required(teamId, 'VERCEL_ORG_ID')
  const accessToken = required(token, 'VERCEL_TOKEN')
  const deployments = []
  let until

  for (let page = 0; page < 100; page += 1) {
    const url = new URL('https://api.vercel.com/v7/deployments')
    url.searchParams.set('projectId', project)
    url.searchParams.set('teamId', team)
    url.searchParams.set('target', 'preview')
    url.searchParams.set('branch', gitBranch)
    url.searchParams.set('limit', '100')
    if (until !== undefined) url.searchParams.set('until', String(until))

    const result = await vercelRequest(fetchImpl, url, accessToken)
    for (const deployment of result.deployments ?? []) {
      if (deployment.meta?.githubCommitRef !== gitBranch) {
        throw new Error(
          `Vercel deployment ${deployment.uid ?? 'without id'} did not match Git branch`,
        )
      }
      deployments.push(deployment.uid)
    }

    until = result.pagination?.next
    if (until === null || until === undefined) break
    if (page === 99)
      throw new Error('Vercel deployment pagination exceeded 100 pages')
  }

  await Promise.all(
    deployments.map((deploymentId) => {
      const url = new URL(
        `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}`,
      )
      url.searchParams.set('teamId', team)
      return vercelRequest(fetchImpl, url, accessToken, { method: 'DELETE' })
    }),
  )
  return deployments
}

async function main() {
  const deleted = await deleteVercelBranchDeployments({
    branch: process.env.GIT_BRANCH,
    projectId: process.env.VERCEL_PROJECT_ID,
    teamId: process.env.VERCEL_ORG_ID,
    token: process.env.VERCEL_TOKEN,
  })
  console.log(`Deleted ${deleted.length} Vercel Preview deployment(s).`)
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main()
}
