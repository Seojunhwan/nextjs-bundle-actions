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
  deferredRoutes: [
    {
      path: '/checkout', status: 'changed',
      baseAssetCount: 1, headAssetCount: 2,
      baseRawBytes: 80, headRawBytes: 120,
      rawDeltaBytes: 40, rawDeltaPercentage: 50,
      baseGzipBytes: 30, headGzipBytes: 45,
      gzipDeltaBytes: 15, gzipDeltaPercentage: 50,
    },
    {
      path: '/new-lazy', status: 'unavailable',
      baseAssetCount: null, headAssetCount: 1,
      baseRawBytes: null, headRawBytes: 50,
      rawDeltaBytes: null, rawDeltaPercentage: null,
      baseGzipBytes: null, headGzipBytes: 20,
      gzipDeltaBytes: null, gzipDeltaPercentage: null,
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
    expect(comment).toContain('### Deferred client JS')
    expect(comment).toContain(
      '| `/checkout` | changed | 2 | 45 B | +15 B | +50.0% |',
    )
    expect(comment).not.toContain('`/new-lazy`')
    expect(comment).toContain('[Download head snapshot JSON](https://github.example/artifact/1)')
  })

  it('shows a head deferred size when the base metric is unavailable', () => {
    const comment = renderComment({
      diff: {
        ...diff,
        deferredRoutes: [diff.deferredRoutes[1]!],
      },
      evaluation: { status: 'pass', violations: [] },
      artifactUrl: 'https://github.example/artifact/1',
      topN: 1,
    })

    expect(comment).toContain(
      '| `/new-lazy` | unavailable | 1 | 20 B | — | — |',
    )
  })

  it('omits unavailable zero-sized deferred rows', () => {
    const comment = renderComment({
      diff: {
        ...diff,
        deferredRoutes: [{
          path: '/legacy', status: 'unavailable',
          baseAssetCount: null, headAssetCount: null,
          baseRawBytes: null, headRawBytes: null,
          rawDeltaBytes: null, rawDeltaPercentage: null,
          baseGzipBytes: null, headGzipBytes: null,
          gzipDeltaBytes: null, gzipDeltaPercentage: null,
        }],
      },
      evaluation: { status: 'pass', violations: [] },
      artifactUrl: 'https://github.example/artifact/1',
      topN: 20,
    })

    expect(comment).not.toContain('### Deferred client JS')
    expect(comment).not.toContain('`/legacy`')
  })

  it('explains an incompatible comparison', () => {
    const comment = renderComment({
      diff: {
        ...diff,
        compatible: false,
        routes: [],
        deferredRoutes: [],
        diagnostics: ['Route metrics are not compatible'],
      },
      evaluation: { status: 'skipped', violations: [] },
      artifactUrl: 'https://github.example/artifact/1',
      topN: 20,
    })

    expect(comment).toContain('Reason: Route metrics are not compatible')
  })
})
