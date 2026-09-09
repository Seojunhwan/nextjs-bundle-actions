import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { collect } from '../../src/index.js'

const buildPath = fileURLToPath(
  new URL('../fixtures/app-turbopack/.next', import.meta.url),
)

describe('collect Turbopack build', () => {
  it('uses route bundle diagnostics and restores the initial polyfill asset', async () => {
    const snapshot = await collect(buildPath, {
      repository: 'acme/storefront',
      projectId: 'web',
      commitSha: 'abc123',
    })

    expect(snapshot.environment).toEqual({
      nextVersion: '16.2.3',
      bundler: 'turbopack',
      routers: ['app'],
    })
    expect(snapshot.capabilities).toContain('route.deferredAssets.v1')
    expect(snapshot.routes.map(({ path, initialAssets, rawBytes }) => ({
      path,
      initialAssets,
      rawBytes,
    }))).toEqual([
      {
        path: '/',
        initialAssets: [
          'static/chunks/shared.js',
          'static/chunks/home.js',
          'static/chunks/polyfill.js',
        ],
        rawBytes: 23,
      },
      {
        path: '/products/[id]',
        initialAssets: [
          'static/chunks/shared.js',
          'static/chunks/product.js',
          'static/chunks/polyfill.js',
        ],
        rawBytes: 26,
      },
    ])
    expect(snapshot.diagnostics).toContain(
      'route-bundle-stats.json excludes build polyfills; 1 polyfill asset was added to every route.',
    )
    expect(snapshot.routes.map((route) => ({
      path: route.path,
      deferredAssets: route.deferredAssets,
      deferredRawBytes: route.deferredRawBytes,
      deferredGzipBytes: route.deferredGzipBytes,
    }))).toEqual([
      {
        path: '/',
        deferredAssets: [],
        deferredRawBytes: 0,
        deferredGzipBytes: 0,
      },
      {
        path: '/products/[id]',
        deferredAssets: ['static/chunks/deferred-product.js'],
        deferredRawBytes: 17,
        deferredGzipBytes: 37,
      },
    ])
  })
})
