import artifact from '@actions/artifact'
import * as core from '@actions/core'
import { context } from '@actions/github'
import { tmpdir } from 'node:os'

import { GitHubArtifactStore } from '../adapters/github-artifact/store.js'
import { runCollect } from '../application/run-collect.js'

function optionalPositiveInteger(name: string): number | undefined {
  const value = core.getInput(name).trim()
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function booleanInput(name: string): boolean {
  const value = core.getInput(name).trim().toLowerCase()
  if (!value || value === 'false') return false
  if (value === 'true') return true
  throw new Error(`${name} must be true or false`)
}

export async function main(): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY
  const pullRequestHead = context.payload.pull_request?.head?.sha
  const commitSha =
    core.getInput('commit-sha').trim() ||
    (typeof pullRequestHead === 'string' ? pullRequestHead : process.env.GITHUB_SHA)
  if (!repository || !commitSha) {
    throw new Error('GITHUB_REPOSITORY and a commit SHA are required')
  }

  const retentionDays = optionalPositiveInteger('retention-days')
  const store = new GitHubArtifactStore(artifact, {
    repository,
    runId: context.runId,
    serverUrl: process.env.GITHUB_SERVER_URL ?? 'https://github.com',
    tempRoot: process.env.RUNNER_TEMP ?? tmpdir(),
    ...(retentionDays === undefined ? {} : { retentionDays }),
  })
  const outcome = await runCollect({
    buildPath: core.getInput('build-path') || '.next',
    identity: {
      repository,
      projectId: core.getInput('project-id') || 'default',
      commitSha,
    },
    options: { strict: booleanInput('strict') },
  }, { artifactStore: store })

  core.setOutput('artifact-id', outcome.artifact.id)
  core.setOutput('artifact-name', outcome.artifact.name)
  core.setOutput('artifact-url', outcome.artifact.url)
  core.setOutput('artifact-digest', outcome.artifact.digest ?? '')
  core.setOutput('snapshot-path', outcome.artifact.snapshotPath)
  core.setOutput('capabilities', JSON.stringify(outcome.snapshot.capabilities))
  for (const diagnostic of outcome.snapshot.diagnostics) {
    core.warning(diagnostic)
  }
  core.info(`Stored bundle snapshot for ${commitSha}`)
}

main().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})
