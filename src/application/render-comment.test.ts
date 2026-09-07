import { describe, expect, it } from 'vitest'

import { renderComment } from '../index.js'
import type { BundleDiff, Evaluation } from '../contracts/index.js'

const diff: BundleDiff = {
  compatible: true,
  base: { repository: 'acme/storefront', projectId: 'web', commitSha: 'base1234' },
  head: { repository: 'acme/storefront', projectId: 'web', commitSha: 'head5678' },
  routes: [
    {
      path: '/checkout', status: 'changed',
      baseRawBytes: 200, headRawBytes: 240, rawDeltaBytes: 40, rawDeltaPercentage: 20,
      baseGzipBytes: 100, headGzipBytes: 125, gzipDeltaBytes: 25, gzipDeltaPercentage: 25,
    },
    {
      path: '/small', status: 'changed',
      baseRawBytes: 20, headRawBytes: 18, rawDeltaBytes: -2, rawDeltaPercentage: -10,
      baseGzipBytes: 10, headGzipBytes: 9, gzipDeltaBytes: -1, gzipDeltaPercentage: -10,
    },
  ],
  diagnostics: [],
}

describe('renderComment', () => {
  it('renders a stable project marker and the largest gzip changes', () => {
    const evaluation: Evaluation = {
      status: 'fail',
      violations: [{ path: '/checkout', rule: 'maxGzipBytes', actual: 125, limit: 110 }],
    }

    const comment = renderComment({
      diff,
      evaluation,
      artifactUrl: 'https://github.example/artifact/1',
      topN: 1,
    })

    expect(comment).toContain('<!-- nextjs-bundle-actions:project=web -->')
    expect(comment).toContain('❌ Bundle budget failed')
    expect(comment).toContain('`base1234` → `head5678`')
    expect(comment).toContain('| `/checkout` | changed | 125 B | +25 B | +25.0% |')
    expect(comment).not.toContain('`/small`')
    expect(comment).toContain('[Download head snapshot JSON](https://github.example/artifact/1)')
  })

  it('explains an incompatible comparison', () => {
    const comment = renderComment({
      diff: {
        ...diff,
        compatible: false,
        routes: [],
        diagnostics: ['Route metrics are not compatible'],
      },
      evaluation: { status: 'skipped', violations: [] },
      artifactUrl: 'https://github.example/artifact/1',
      topN: 20,
    })

    expect(comment).toContain('Reason: Route metrics are not compatible')
  })
})
