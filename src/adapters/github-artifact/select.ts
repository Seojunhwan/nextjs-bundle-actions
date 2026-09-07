export interface RepositoryArtifact {
  id: number
  name: string
  expired: boolean
  createdAt: string
  workflowRun?: {
    id: number
    headSha: string
    headBranch: string | null
  }
}

export function selectExactArtifact(
  artifacts: RepositoryArtifact[],
  expected: { name: string; sha: string; branch: string },
): RepositoryArtifact | undefined {
  return artifacts
    .filter(
      (artifact) =>
        artifact.name === expected.name &&
        !artifact.expired &&
        artifact.workflowRun?.headSha === expected.sha &&
        artifact.workflowRun.headBranch === expected.branch,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]
}
