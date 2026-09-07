import { describe, expect, it } from 'vitest'

import { parseSnapshotJson } from '../index.js'

const validSnapshot = {
  schemaVersion: 1,
  metricDefinitionVersion: 1,
  identity: { repository: 'acme/storefront', projectId: 'web', commitSha: 'abc123' },
  environment: { nextVersion: '16.2.3', bundler: 'webpack', routers: ['app'] },
  capabilities: ['route.initialAssets.v1'],
  assets: [{ id: 'static/chunks/app/page.js', rawBytes: 10, gzipBytes: 20 }],
  routes: [{
    path: '/', initialAssets: ['static/chunks/app/page.js'],
    rawBytes: 10, gzipBytes: 20,
    routeSpecificRawBytes: 10, routeSpecificGzipBytes: 20,
    sharedRawBytes: 0, sharedGzipBytes: 0,
  }],
  diagnostics: [],
}

describe('parseSnapshotJson', () => {
  it('accepts a valid versioned snapshot', () => {
    expect(parseSnapshotJson(JSON.stringify(validSnapshot))).toEqual(validSnapshot)
  })

  it('rejects negative sizes and unknown executable-looking fields', () => {
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      assets: [{ ...validSnapshot.assets[0], rawBytes: -1, command: 'echo unsafe' }],
    }))).toThrow()
  })

  it('rejects input above the configured byte limit before parsing', () => {
    expect(() => parseSnapshotJson(' '.repeat(11), 10)).toThrow('exceeds 10 bytes')
  })
})
