import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { GitHubArtifactStore } from './store.js'
import type { BundleSnapshot } from '../../contracts/index.js'

describe('GitHubArtifactStore', () => {
  it('uploads only a serialized snapshot and returns its immutable reference', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'bundle-action-test-'))
    const uploadArtifact = vi.fn<(
      name: string,
      files: string[],
      rootDirectory: string,
      options?: { retentionDays?: number },
    ) => Promise<{ id: number; digest: string }>>(async () => ({
      id: 42,
      digest: 'sha256:abc',
    }))
    const store = new GitHubArtifactStore({ uploadArtifact }, {
      repository: 'acme/storefront', runId: 99, serverUrl: 'https://github.com', tempRoot,
    })
    const snapshot = {
      schemaVersion: 1, metricDefinitionVersion: 1,
      identity: { repository: 'acme/storefront', projectId: 'web', commitSha: 'abc123' },
      environment: { nextVersion: null, bundler: 'unknown', routers: [] },
      capabilities: [], assets: [], routes: [], diagnostics: [],
    } satisfies BundleSnapshot

    const reference = await store.saveSnapshot(snapshot)

    const [, files, root] = uploadArtifact.mock.calls[0]!
    expect(JSON.parse(await readFile(files[0]!, 'utf8'))).toEqual(snapshot)
    expect(files[0]).toBe(join(root, 'snapshot.json'))
    expect(reference).toEqual({
      id: 42,
      name: 'next-bundle-snapshot--web--abc123--v2',
      snapshotPath: join(root, 'snapshot.json'),
      digest: 'sha256:abc',
      url: 'https://github.com/acme/storefront/actions/runs/99/artifacts/42',
    })
  })
})
