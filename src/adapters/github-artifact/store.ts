import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ArtifactReference, ArtifactStore } from '../../application/run-collect.js'
import type { BundleSnapshot } from '../../contracts/index.js'
import { MAX_SNAPSHOT_BYTES } from '../../contracts/snapshot-schema.js'
import { snapshotArtifactName } from './names.js'

interface UploadClient {
  uploadArtifact(
    name: string,
    files: string[],
    rootDirectory: string,
    options?: { retentionDays?: number },
  ): Promise<{ id?: number; digest?: string }>
}

export interface GitHubArtifactStoreContext {
  repository: string
  runId: number
  serverUrl: string
  tempRoot: string
  retentionDays?: number
}

export class GitHubArtifactStore implements ArtifactStore {
  constructor(
    private readonly client: UploadClient,
    private readonly context: GitHubArtifactStoreContext,
  ) {}

  async saveSnapshot(snapshot: BundleSnapshot): Promise<ArtifactReference> {
    const root = await mkdtemp(join(this.context.tempRoot, 'next-bundle-snapshot-'))
    const snapshotPath = join(root, 'snapshot.json')
    const serialized = `${JSON.stringify(snapshot, null, 2)}\n`
    if (Buffer.byteLength(serialized) > MAX_SNAPSHOT_BYTES) {
      throw new Error(`Snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`)
    }
    await writeFile(snapshotPath, serialized, 'utf8')

    const options = this.context.retentionDays === undefined
      ? undefined
      : { retentionDays: this.context.retentionDays }
    const name = snapshotArtifactName(
      snapshot.identity.projectId,
      snapshot.identity.commitSha,
    )
    const response = await this.client.uploadArtifact(
      name,
      [snapshotPath],
      root,
      options,
    )
    if (response.id === undefined) {
      throw new Error('GitHub did not return an artifact ID')
    }

    return {
      id: response.id,
      name,
      snapshotPath,
      ...(response.digest === undefined ? {} : { digest: response.digest }),
      url: `${this.context.serverUrl}/${this.context.repository}/actions/runs/${this.context.runId}/artifacts/${response.id}`,
    }
  }
}
