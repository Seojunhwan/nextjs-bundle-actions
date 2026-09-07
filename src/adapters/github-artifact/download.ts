import { lstat, mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  MAX_SNAPSHOT_BYTES,
  parseSnapshotJson,
} from '../../contracts/snapshot-schema.js'
import type { BundleSnapshot } from '../../contracts/index.js'

interface DownloadClient {
  downloadArtifact(
    artifactId: number,
    options: {
      path: string
      findBy: {
        token: string
        workflowRunId: number
        repositoryOwner: string
        repositoryName: string
      }
    },
  ): Promise<unknown>
}

export async function downloadSnapshot(
  client: DownloadClient,
  input: {
    artifactId: number
    workflowRunId: number
    owner: string
    repo: string
    token: string
    tempRoot: string
  },
): Promise<BundleSnapshot> {
  const destination = await mkdtemp(join(input.tempRoot, 'next-bundle-download-'))
  await client.downloadArtifact(input.artifactId, {
    path: destination,
    findBy: {
      token: input.token,
      workflowRunId: input.workflowRunId,
      repositoryOwner: input.owner,
      repositoryName: input.repo,
    },
  })
  const snapshotPath = join(destination, 'snapshot.json')
  const metadata = await lstat(snapshotPath)
  if (!metadata.isFile()) throw new Error('Artifact snapshot.json is not a file')
  if (metadata.size > MAX_SNAPSHOT_BYTES) {
    throw new Error(`Snapshot exceeds ${MAX_SNAPSHOT_BYTES} bytes`)
  }
  return parseSnapshotJson(await readFile(snapshotPath, 'utf8'))
}
