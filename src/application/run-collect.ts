import type { BundleSnapshot, SnapshotIdentity } from '../contracts/index.js'
import { collect } from './collect.js'
import type { CollectOptions } from './collect.js'

export interface ArtifactReference {
  id: number
  url: string
  digest?: string
}

export interface ArtifactStore {
  saveSnapshot(snapshot: BundleSnapshot): Promise<ArtifactReference>
}

export interface RunCollectInput {
  buildPath: string
  identity: SnapshotIdentity
  options?: CollectOptions
}

export async function runCollect(
  input: RunCollectInput,
  ports: { artifactStore: ArtifactStore },
): Promise<{
  status: 'stored'
  snapshot: BundleSnapshot
  artifact: ArtifactReference
}> {
  const snapshot = await collect(input.buildPath, input.identity, input.options)
  const artifact = await ports.artifactStore.saveSnapshot(snapshot)
  return { status: 'stored', snapshot, artifact }
}
