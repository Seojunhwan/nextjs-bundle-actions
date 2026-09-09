import { describe, expect, it } from 'vitest'

import { selectExactArtifact, selectVersionedArtifact } from './select.js'

describe('selectExactArtifact', () => {
  it('ignores expired and mismatched-SHA artifacts', () => {
    expect(selectExactArtifact([
      { id: 1, name: 'snapshot', expired: false, createdAt: '2026-01-01', workflowRun: { id: 11, headSha: 'wrong', headBranch: 'main' } },
      { id: 2, name: 'snapshot', expired: true, createdAt: '2026-01-03', workflowRun: { id: 12, headSha: 'base', headBranch: 'main' } },
      { id: 3, name: 'snapshot', expired: false, createdAt: '2026-01-02', workflowRun: { id: 13, headSha: 'base', headBranch: 'main' } },
    ], { name: 'snapshot', sha: 'base', branch: 'main' })?.id).toBe(3)
  })

  it('prefers schema v2 and falls back to an exact schema v1 artifact', () => {
    const artifacts = [
      { id: 1, name: 'snapshot-v1', expired: false, createdAt: '2026-01-03', workflowRun: { id: 11, headSha: 'base', headBranch: 'main' } },
      { id: 2, name: 'snapshot-v2', expired: false, createdAt: '2026-01-02', workflowRun: { id: 12, headSha: 'base', headBranch: 'main' } },
    ]

    expect(selectVersionedArtifact(artifacts, {
      names: ['snapshot-v2', 'snapshot-v1'],
      sha: 'base',
      branch: 'main',
    })?.id).toBe(2)
    expect(selectVersionedArtifact(artifacts.slice(0, 1), {
      names: ['snapshot-v2', 'snapshot-v1'],
      sha: 'base',
      branch: 'main',
    })?.id).toBe(1)
  })
})
