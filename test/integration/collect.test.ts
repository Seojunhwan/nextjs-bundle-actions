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
    expect(snapshot.routes).toEqual([
      expect.objectContaining({
        path: '/',
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
  })
})
