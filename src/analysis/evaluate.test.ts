import { describe, expect, it } from 'vitest'

import { evaluate } from '../index.js'
import type { BundleDiff } from '../contracts/index.js'

const diff: BundleDiff = {
  compatible: true,
  base: { repository: 'acme/storefront', projectId: 'web', commitSha: 'base' },
  head: { repository: 'acme/storefront', projectId: 'web', commitSha: 'head' },
  routes: [
    {
      path: '/checkout',
      status: 'changed',
      baseRawBytes: 200,
      headRawBytes: 240,
      rawDeltaBytes: 40,
      rawDeltaPercentage: 20,
      baseGzipBytes: 100,
      headGzipBytes: 120,
      gzipDeltaBytes: 20,
      gzipDeltaPercentage: 20,
    },
    {
      path: '/new',
      status: 'added',
      baseRawBytes: null,
      headRawBytes: 90,
      rawDeltaBytes: 90,
      rawDeltaPercentage: null,
      baseGzipBytes: null,
      headGzipBytes: 45,
      gzipDeltaBytes: 45,
      gzipDeltaPercentage: null,
    },
  ],
  deferredRoutes: [],
  diagnostics: [],
}

describe('evaluate', () => {
  it('fails when any configured gzip budget is exceeded', () => {
    const result = evaluate(diff, {
      maxGzipBytes: 110,
      maxGzipDeltaBytes: 25,
      maxGzipDeltaPercentage: 15,
    })

    expect(result.status).toBe('fail')
    expect(result.violations).toEqual([
      {
        path: '/checkout',
        rule: 'maxGzipBytes',
        actual: 120,
        limit: 110,
      },
      {
        path: '/checkout',
        rule: 'maxGzipDeltaPercentage',
        actual: 20,
        limit: 15,
      },
      {
        path: '/new',
        rule: 'maxGzipDeltaBytes',
        actual: 45,
        limit: 25,
      },
    ])
  })

  it('skips evaluation when route metrics are incompatible', () => {
    expect(evaluate({ ...diff, compatible: false }, {}).status).toBe('skipped')
  })
})
