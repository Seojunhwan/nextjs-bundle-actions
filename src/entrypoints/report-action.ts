import artifact from '@actions/artifact'
import * as core from '@actions/core'
import { context, getOctokit } from '@actions/github'
import { tmpdir } from 'node:os'

import { downloadSnapshot } from '../adapters/github-artifact/download.js'
import { snapshotArtifactName } from '../adapters/github-artifact/names.js'
import {
  selectVersionedArtifact,
  type RepositoryArtifact,
} from '../adapters/github-artifact/select.js'
import { GitHubCommentReporter } from '../adapters/github-comment/reporter.js'
import { runReport } from '../application/run-report.js'
import { parseReportConfig } from '../application/report-config.js'
import type { BudgetPolicy, BundleSnapshot } from '../contracts/index.js'

function optionalNonNegativeNumber(name: string): number | undefined {
  const input = core.getInput(name).trim()
  if (!input) return undefined
  const value = Number(input)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }
  return value
}

function optionalPositiveInteger(name: string): number | undefined {
  const input = core.getInput(name).trim()
  if (!input) return undefined
  const value = Number(input)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function mergePolicy(
  configured: BudgetPolicy,
  inputs: BudgetPolicy,
): BudgetPolicy {
  return { ...configured, ...inputs }
}

function safeRepositoryPath(path: string): string {
  const segments = path.split('/')
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`config-path must be a safe repository-relative path: ${path}`)
  }
  return path
}

function assertIdentity(
  snapshot: BundleSnapshot,
  expected: { repository: string; projectId: string; commitSha: string },
): void {
  if (
    snapshot.identity.repository !== expected.repository ||
    snapshot.identity.projectId !== expected.projectId ||
    snapshot.identity.commitSha !== expected.commitSha
  ) {
    throw new Error('Snapshot identity does not match trusted workflow metadata')
  }
}

export async function main(): Promise<void> {
  const workflowRun = context.payload.workflow_run
  if (!workflowRun || typeof workflowRun.id !== 'number') {
    throw new Error('report must run from a workflow_run event')
  }
  if (workflowRun.event !== 'pull_request') {
    core.info(`No PR report is required for ${String(workflowRun.event)}`)
    return
  }
  if (workflowRun.conclusion !== 'success') {
    core.info(`Source workflow concluded with ${String(workflowRun.conclusion)}`)
    return
  }

  const token = core.getInput('github-token', { required: true })
  const projectId = core.getInput('project-id') || 'default'
  const repository = process.env.GITHUB_REPOSITORY
  if (!repository) throw new Error('GITHUB_REPOSITORY is required')
  const [owner, repo] = repository.split('/')
  if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`)
  const octokit = getOctokit(token)

  let pullNumber = workflowRun.pull_requests?.[0]?.number
  if (!pullNumber) {
    const associated = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: workflowRun.head_sha,
    })
    pullNumber = associated.data.find((pull) => pull.state === 'open')?.number
  }
  if (!pullNumber) throw new Error('Could not resolve the source pull request')

  const pull = await octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber })
  const tempRoot = process.env.RUNNER_TEMP ?? tmpdir()
  const headArtifactName = snapshotArtifactName(projectId, pull.data.head.sha)
  const sourceArtifacts = await octokit.rest.actions.listWorkflowRunArtifacts({
    owner,
    repo,
    run_id: workflowRun.id,
    name: headArtifactName,
    per_page: 100,
  })
  const headArtifact = sourceArtifacts.data.artifacts
    .filter((item) => item.name === headArtifactName && !item.expired)
    .sort((left, right) =>
      (right.created_at ?? '').localeCompare(left.created_at ?? ''),
    )[0]
  if (!headArtifact) {
    core.info('Ignoring a stale workflow run that has no artifact for the current PR head')
    return
  }
  const head = await downloadSnapshot(artifact, {
    artifactId: headArtifact.id,
    workflowRunId: workflowRun.id,
    owner,
    repo,
    token,
    tempRoot,
  })
  assertIdentity(head, {
    repository,
    projectId,
    commitSha: pull.data.head.sha,
  })

  const baseArtifactNames = [
    snapshotArtifactName(projectId, pull.data.base.sha),
    snapshotArtifactName(projectId, pull.data.base.sha, 1),
  ]
  const listed = await Promise.all(baseArtifactNames.map((name) =>
    octokit.rest.actions.listArtifactsForRepo({
      owner,
      repo,
      name,
      per_page: 100,
    }),
  ))
  const candidates: RepositoryArtifact[] = listed.flatMap(
    (response) => response.data.artifacts,
  ).map((item) => {
    const run = item.workflow_run
    const hasVerifiableRun =
      typeof run?.id === 'number' &&
      typeof run.head_sha === 'string' &&
      (typeof run.head_branch === 'string' || run.head_branch === null)
    return {
      id: item.id,
      name: item.name,
      expired: item.expired,
      createdAt: item.created_at ?? '',
      ...(hasVerifiableRun
        ? {
            workflowRun: {
              id: run.id as number,
              headSha: run.head_sha as string,
              headBranch: run.head_branch as string | null,
            },
          }
        : {}),
    }
  })
  const baseArtifact = selectVersionedArtifact(candidates, {
    names: baseArtifactNames,
    sha: pull.data.base.sha,
    branch: pull.data.base.ref,
  })
  const base = baseArtifact?.workflowRun
    ? await downloadSnapshot(artifact, {
        artifactId: baseArtifact.id,
        workflowRunId: baseArtifact.workflowRun.id,
        owner,
        repo,
        token,
        tempRoot,
      })
    : null
  if (base) {
    assertIdentity(base, {
      repository,
      projectId,
      commitSha: pull.data.base.sha,
    })
  }

  let configuredPolicy: BudgetPolicy = {}
  let configuredTopN: number | undefined
  const configPathInput = core.getInput('config-path').trim()
  if (configPathInput) {
    const configPath = safeRepositoryPath(configPathInput)
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: configPath,
      ref: pull.data.base.sha,
    })
    const data = response.data
    if (Array.isArray(data) || data.type !== 'file' || !('content' in data)) {
      throw new Error(`Report config is not a file: ${configPath}`)
    }
    if (data.encoding !== 'base64') {
      throw new Error(`Unsupported report config encoding: ${String(data.encoding)}`)
    }
    const configured = parseReportConfig(
      Buffer.from(data.content.replaceAll('\n', ''), 'base64').toString('utf8'),
      projectId,
    )
    configuredPolicy = configured.policy
    configuredTopN = configured.topN
  }

  const inputPolicy: BudgetPolicy = {
    ...(() => {
      const value = optionalNonNegativeNumber('max-gzip-bytes')
      return value === undefined ? {} : { maxGzipBytes: value }
    })(),
    ...(() => {
      const value = optionalNonNegativeNumber('max-gzip-delta-bytes')
      return value === undefined ? {} : { maxGzipDeltaBytes: value }
    })(),
    ...(() => {
      const value = optionalNonNegativeNumber('max-gzip-delta-percentage')
      return value === undefined ? {} : { maxGzipDeltaPercentage: value }
    })(),
  }
  const policy = mergePolicy(configuredPolicy, inputPolicy)
  const reporter = new GitHubCommentReporter(octokit.rest.issues, {
    owner,
    repo,
    issueNumber: pullNumber,
  })
  const artifactUrl = `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repository}/actions/runs/${workflowRun.id}/artifacts/${headArtifact.id}`
  const outcome = await runReport({
    base,
    head,
    policy,
    artifactUrl,
    topN: optionalPositiveInteger('top-n') ?? configuredTopN ?? 20,
  }, { reporter })

  core.setOutput('status', outcome.status)
  core.setOutput('violations', JSON.stringify(outcome.evaluation?.violations ?? []))
  if (outcome.evaluation?.status === 'fail') {
    core.setFailed(`${outcome.evaluation.violations.length} bundle budget violation(s)`)
  }
}

main().catch((error: unknown) => {
  core.setFailed(error instanceof Error ? error.message : String(error))
})
