import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

const action = vi.hoisted(() => ({
  getInput: vi.fn<(name: string) => string>(),
  info: vi.fn(),
  setFailed: vi.fn(),
  setOutput: vi.fn(),
  uploadArtifact: vi.fn(async () => ({ id: 42, digest: 'sha256:abc' })),
  warning: vi.fn(),
}))

vi.mock('@actions/artifact', () => ({
  default: { uploadArtifact: action.uploadArtifact },
}))

vi.mock('@actions/core', () => ({
  getInput: action.getInput,
  info: action.info,
  setFailed: action.setFailed,
  setOutput: action.setOutput,
  warning: action.warning,
}))

vi.mock('@actions/github', () => ({
  context: { payload: {}, runId: 99 },
}))

describe('collect Action outputs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('exposes the local snapshot and uploaded Artifact for later workflow steps', async () => {
    const runnerTemp = await mkdtemp(join(tmpdir(), 'collect-action-test-'))
    const buildPath = fileURLToPath(
      new URL('../../test/fixtures/pages-basic/.next', import.meta.url),
    )
    const inputs: Record<string, string> = {
      'build-path': buildPath,
      'project-id': 'web',
      'commit-sha': 'abc123',
      'retention-days': '',
      strict: 'true',
    }
    action.getInput.mockImplementation((name) => inputs[name] ?? '')
    vi.stubEnv('GITHUB_REPOSITORY', 'acme/storefront')
    vi.stubEnv('GITHUB_SHA', 'abc123')
    vi.stubEnv('GITHUB_SERVER_URL', 'https://github.com')
    vi.stubEnv('RUNNER_TEMP', runnerTemp)

    await import('./collect-action.js')
    await vi.waitFor(() => expect(action.setOutput).toHaveBeenCalledWith(
      'artifact-name',
      'next-bundle-snapshot--web--abc123--v2',
    ))

    const snapshotPath = action.setOutput.mock.calls.find(
      ([name]) => name === 'snapshot-path',
    )?.[1]
    expect(snapshotPath).toEqual(expect.any(String))
    expect(JSON.parse(await readFile(String(snapshotPath), 'utf8'))).toMatchObject({
      identity: {
        repository: 'acme/storefront',
        projectId: 'web',
        commitSha: 'abc123',
      },
    })
    expect(action.setOutput).toHaveBeenCalledWith('artifact-id', 42)
    expect(action.setOutput).toHaveBeenCalledWith(
      'artifact-url',
      'https://github.com/acme/storefront/actions/runs/99/artifacts/42',
    )
    expect(action.setFailed).not.toHaveBeenCalled()
  })
})
