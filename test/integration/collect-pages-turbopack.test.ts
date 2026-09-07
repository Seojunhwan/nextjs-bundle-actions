import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { collect } from '../../src/index.js'

const buildPath = fileURLToPath(
  new URL('../fixtures/pages-turbopack/.next', import.meta.url),
)

describe('collect Pages Router Turbopack build', () => {
  it('adds Pages document manifest scripts omitted from route diagnostics', async () => {
    const snapshot = await collect(buildPath, {
      repository: 'acme/storefront',
      projectId: 'web',
      commitSha: 'abc123',
    }, { strict: true })

    expect(snapshot.environment.routers).toEqual(['pages'])
    expect(snapshot.routes).toEqual([
      expect.objectContaining({
        path: '/',
        initialAssets: [
          'static/chunks/shared.js',
          'static/chunks/home.js',
          'static/build/_buildManifest.js',
          'static/build/_ssgManifest.js',
        ],
        rawBytes: 21,
      }),
    ])
  })
})
