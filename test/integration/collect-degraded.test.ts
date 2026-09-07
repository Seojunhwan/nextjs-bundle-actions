import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { collect } from '../../src/index.js'

const buildPath = fileURLToPath(
  new URL('../fixtures/unknown-format/.next', import.meta.url),
)

const identity = {
  repository: 'acme/storefront',
  projectId: 'web',
  commitSha: 'abc123',
}

describe('collect unsupported output', () => {
  it('stores measurable asset facts without inventing route associations', async () => {
    const snapshot = await collect(buildPath, identity)

    expect(snapshot.capabilities).toEqual([
      'asset.rawBytes.v1',
      'asset.gzipBytes.v1',
      'build.emittedClientAssets.v1',
    ])
    expect(snapshot.routes).toEqual([])
    expect(snapshot.assets.map((asset) => asset.id)).toEqual([
      'static/chunks/a.js',
      'static/chunks/nested/b.js',
    ])
    expect(snapshot.diagnostics[0]).toMatch(/collector degraded:/)
  })

  it('surfaces the unsupported format in strict mode', async () => {
    await expect(collect(buildPath, identity, { strict: true })).rejects.toThrow(
      /build-manifest\.json/,
    )
  })
})
