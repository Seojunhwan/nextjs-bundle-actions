import { SCHEMA_VERSION } from '../../contracts/index.js'
import { projectKey } from '../../application/project-key.js'

function safePart(value: string): string {
  const result = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!result) throw new Error('Artifact name part cannot be empty')
  return result.slice(0, 100)
}

export function snapshotArtifactName(
  projectId: string,
  commitSha: string,
): string {
  return `next-bundle-snapshot--${projectKey(projectId)}--${safePart(commitSha)}--v${SCHEMA_VERSION}`
}
