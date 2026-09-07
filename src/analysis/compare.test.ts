import { describe, expect, it } from 'vitest'

import { compare } from '../index.js'
import type { BundleSnapshot } from '../contracts/index.js'

function snapshot(
  commitSha: string,
  routes: Array<{ path: string; rawBytes: number; gzipBytes: number }>,
): BundleSnapshot {
  return {
    schemaVersion: 1,
    metricDefinitionVersion: 1,
    identity: {
      repository: 'acme/storefront',
      projectId: 'web',
      commitSha,
    },
    environment: {
      nextVersion: '16.2.3',
      bundler: 'webpack',
      routers: ['pages'],
    },
    capabilities: ['route.initialAssets.v1'],
    assets: [],
    routes: routes.map((route) => ({
      ...route,
      initialAssets: [],
      routeSpecificRawBytes: route.rawBytes,
      routeSpecificGzipBytes: route.gzipBytes,
      sharedRawBytes: 0,
      sharedGzipBytes: 0,
    })),
    diagnostics: [],
  }
}

describe('compare', () => {
  it('reports changed, added, and removed routes', () => {
    const result = compare(
      snapshot('base', [
        { path: '/', rawBytes: 100, gzipBytes: 50 },
        { path: '/removed', rawBytes: 20, gzipBytes: 10 },
      ]),
      snapshot('head', [
        { path: '/', rawBytes: 130, gzipBytes: 60 },
        { path: '/added', rawBytes: 40, gzipBytes: 20 },
      ]),
    )

    expect(result.compatible).toBe(true)
    expect(result.routes).toEqual([
      expect.objectContaining({
        path: '/',
        status: 'changed',
        gzipDeltaBytes: 10,
        gzipDeltaPercentage: 20,
      }),
      expect.objectContaining({
        path: '/added',
        status: 'added',
        gzipDeltaBytes: 20,
        gzipDeltaPercentage: null,
      }),
      expect.objectContaining({
        path: '/removed',
        status: 'removed',
        gzipDeltaBytes: -10,
        gzipDeltaPercentage: -100,
      }),
    ])
  })
})
