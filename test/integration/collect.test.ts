import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { collect } from '../../src/index.js'

const buildPath = fileURLToPath(
  new URL('../fixtures/pages-basic/.next', import.meta.url),
)

describe('collect', () => {
  it('creates a route snapshot from a Pages Router build', async () => {
    const snapshot = await collect(buildPath, {
      repository: 'acme/storefront',
      projectId: 'web',
      commitSha: 'abc123',
    })

    expect(snapshot.identity).toEqual({
      repository: 'acme/storefront',
      projectId: 'web',
      commitSha: 'abc123',
    })
    expect(snapshot.environment.routers).toEqual(['pages'])
    expect(snapshot.capabilities).not.toContain('route.deferredAssets.v1')
    expect(snapshot.routes).toEqual([
      expect.objectContaining({
        path: '/',
        deferredAssets: null,
        deferredRawBytes: null,
        deferredGzipBytes: null,
        initialAssets: [
          'static/chunks/polyfill.js',
          'static/chunks/framework.js',
          'static/chunks/pages/_app.js',
          'static/chunks/pages/index.js',
          'static/build/_buildManifest.js',
        ],
        rawBytes: 29,
      }),
    ])
    expect(snapshot.diagnostics).toContain(
      'Deferred client JavaScript metrics are unavailable for Pages Router routes.',
    )
  })
})
