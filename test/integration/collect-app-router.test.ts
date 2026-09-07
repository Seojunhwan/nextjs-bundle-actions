import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { collect } from '../../src/index.js'

const buildPath = fileURLToPath(
  new URL('../fixtures/app-webpack/.next', import.meta.url),
)

describe('collect App Router build', () => {
  it('combines root assets with each static or dynamic route entry', async () => {
    const snapshot = await collect(buildPath, {
      repository: 'acme/storefront',
      projectId: 'web',
      commitSha: 'abc123',
    })

    expect(snapshot.environment).toEqual({
      nextVersion: '16.2.3',
      bundler: 'webpack',
      routers: ['app'],
    })
    expect(snapshot.routes.map(({ path, rawBytes, initialAssets }) => ({
      path,
      rawBytes,
      initialAssets,
    }))).toEqual([
      {
        path: '/',
        rawBytes: 17,
        initialAssets: [
          'static/chunks/root.js',
          'static/chunks/polyfill.js',
          'static/chunks/app/page-a1.js',
        ],
      },
      {
        path: '/dashboard',
        rawBytes: 18,
        initialAssets: [
          'static/chunks/root.js',
          'static/chunks/polyfill.js',
          'static/chunks/app/dashboard/page-b2.js',
        ],
      },
      {
        path: '/products/[id]',
        rawBytes: 19,
        initialAssets: [
          'static/chunks/root.js',
          'static/chunks/polyfill.js',
          'static/chunks/app/products/[id]/page-c3.js',
        ],
      },
    ])
  })
})
