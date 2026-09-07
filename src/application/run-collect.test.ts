import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { runCollect, type ArtifactReference, type ArtifactStore } from '../index.js'
import type { BundleSnapshot } from '../contracts/index.js'

const buildPath = fileURLToPath(
  new URL('../../test/fixtures/pages-basic/.next', import.meta.url),
)

class MemoryArtifactStore implements ArtifactStore {
  saved: BundleSnapshot[] = []

  async saveSnapshot(snapshot: BundleSnapshot): Promise<ArtifactReference> {
    this.saved.push(snapshot)
    return {
      id: 42,
      name: 'next-bundle-snapshot--web--abc123--v1',
      snapshotPath: '/tmp/snapshot.json',
      url: 'https://github.example/artifacts/42',
      digest: 'sha256:abc',
    }
  }
}

describe('runCollect', () => {
  it('collects and persists a reusable snapshot', async () => {
    const artifactStore = new MemoryArtifactStore()
    const outcome = await runCollect({
      buildPath,
      identity: { repository: 'acme/storefront', projectId: 'web', commitSha: 'abc123' },
    }, { artifactStore })

    expect(outcome.status).toBe('stored')
    expect(outcome.artifact.id).toBe(42)
    expect(artifactStore.saved[0]?.identity.commitSha).toBe('abc123')
  })
})
