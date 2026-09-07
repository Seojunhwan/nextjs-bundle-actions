import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { collect } from '../../src/index.js'

const buildPath = fileURLToPath(
  new URL('../fixtures/mixed-webpack/.next', import.meta.url),
)

describe('collect mixed router build', () => {
  it('merges App and Pages routes behind the same collector contract', async () => {
    const snapshot = await collect(buildPath, {
      repository: 'acme/storefront',
      projectId: 'web',
      commitSha: 'abc123',
    }, { strict: true })

    expect(snapshot.environment.routers).toEqual(['app', 'pages'])
    expect(snapshot.routes.map((route) => route.path)).toEqual([
      '/app-home',
      '/legacy',
    ])
    expect(snapshot.routes.find((route) => route.path === '/legacy')?.initialAssets)
      .toEqual([
        'static/chunks/polyfill.js',
        'static/chunks/framework.js',
        'static/chunks/pages/legacy.js',
      ])
  })
})
