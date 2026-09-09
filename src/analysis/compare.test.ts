import { describe, expect, it } from 'vitest'

import { compare } from '../index.js'
import type { BundleSnapshot } from '../contracts/index.js'

function snapshot(
  commitSha: string,
  routes: Array<{
    path: string
    rawBytes: number
    gzipBytes: number
    deferredRawBytes?: number
    deferredGzipBytes?: number
    deferredAssets?: string[]
  }>,
  schemaVersion: 1 | 2 = 2,
): BundleSnapshot {
  return {
    schemaVersion,
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
    capabilities: [
      'route.initialAssets.v1',
      ...(schemaVersion === 2 ? ['route.deferredAssets.v1'] : []),
    ],
    assets: [],
    routes: routes.map((route) => ({
      ...route,
      initialAssets: [],
      routeSpecificRawBytes: route.rawBytes,
      routeSpecificGzipBytes: route.gzipBytes,
      sharedRawBytes: 0,
      sharedGzipBytes: 0,
      deferredAssets: schemaVersion === 2 ? route.deferredAssets ?? [] : null,
      deferredRawBytes: schemaVersion === 2 ? route.deferredRawBytes ?? 0 : null,
      deferredGzipBytes: schemaVersion === 2 ? route.deferredGzipBytes ?? 0 : null,
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

  it('reports deferred client JavaScript independently from initial assets', () => {
    const result = compare(
      snapshot('base', [
        {
          path: '/', rawBytes: 100, gzipBytes: 50,
          deferredRawBytes: 100, deferredGzipBytes: 40,
          deferredAssets: ['static/chunks/base.js'],
        },
        {
          path: '/removed', rawBytes: 20, gzipBytes: 10,
          deferredRawBytes: 10, deferredGzipBytes: 5,
          deferredAssets: ['static/chunks/removed.js'],
        },
      ]),
      snapshot('head', [
        {
          path: '/', rawBytes: 100, gzipBytes: 50,
          deferredRawBytes: 130, deferredGzipBytes: 50,
          deferredAssets: ['static/chunks/head.js'],
        },
        {
          path: '/added', rawBytes: 20, gzipBytes: 10,
          deferredRawBytes: 30, deferredGzipBytes: 12,
          deferredAssets: ['static/chunks/added.js'],
        },
      ]),
    )

    expect(result.deferredRoutes).toEqual([
      expect.objectContaining({
        path: '/', status: 'changed', headAssetCount: 1,
        gzipDeltaBytes: 10, gzipDeltaPercentage: 25,
      }),
      expect.objectContaining({
        path: '/added', status: 'added', headAssetCount: 1,
        gzipDeltaBytes: 12, gzipDeltaPercentage: null,
      }),
      expect.objectContaining({
        path: '/removed', status: 'removed', headAssetCount: 0,
        gzipDeltaBytes: -5, gzipDeltaPercentage: -100,
      }),
    ])
  })

  it('keeps the head size but marks a version 1 base delta unavailable', () => {
    const result = compare(
      snapshot('base', [{ path: '/', rawBytes: 100, gzipBytes: 50 }], 1),
      snapshot('head', [{
        path: '/', rawBytes: 100, gzipBytes: 50,
        deferredRawBytes: 130, deferredGzipBytes: 50,
        deferredAssets: ['static/chunks/head.js'],
      }]),
    )

    expect(result.deferredRoutes).toEqual([
      expect.objectContaining({
        path: '/',
        status: 'unavailable',
        baseGzipBytes: null,
        headGzipBytes: 50,
        gzipDeltaBytes: null,
        gzipDeltaPercentage: null,
      }),
    ])
  })
})
