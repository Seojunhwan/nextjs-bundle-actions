import { describe, expect, it } from 'vitest'

import { parseSnapshotJson } from '../index.js'

const legacySnapshot = {
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

const validSnapshot = {
  ...legacySnapshot,
  schemaVersion: 2,
  capabilities: ['route.initialAssets.v1', 'route.deferredAssets.v1'],
  assets: [
    ...legacySnapshot.assets,
    { id: 'static/chunks/deferred.js', rawBytes: 5, gzipBytes: 15 },
  ],
  routes: legacySnapshot.routes.map((route) => ({
    ...route,
    deferredAssets: ['static/chunks/deferred.js'],
    deferredRawBytes: 5,
    deferredGzipBytes: 15,
  })),
}

describe('parseSnapshotJson', () => {
  it('accepts a valid version 2 snapshot', () => {
    expect(parseSnapshotJson(JSON.stringify(validSnapshot))).toEqual(validSnapshot)
  })

  it('normalizes a version 1 snapshot with unavailable deferred metrics', () => {
    expect(parseSnapshotJson(JSON.stringify(legacySnapshot))).toEqual({
      ...legacySnapshot,
      routes: legacySnapshot.routes.map((route) => ({
        ...route,
        deferredAssets: null,
        deferredRawBytes: null,
        deferredGzipBytes: null,
      })),
    })
  })

  it('requires deferred fields in a version 2 snapshot', () => {
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      routes: legacySnapshot.routes,
    }))).toThrow()
  })

  it('rejects negative sizes and unknown executable-looking fields', () => {
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      assets: [{ ...validSnapshot.assets[0], rawBytes: -1, command: 'echo unsafe' }],
    }))).toThrow()
  })

  it('rejects unsafe and unmeasured asset references', () => {
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      routes: [{
        ...validSnapshot.routes[0],
        deferredAssets: ['../outside.js'],
      }],
    }))).toThrow()
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      routes: [{
        ...validSnapshot.routes[0],
        deferredAssets: ['static/chunks/missing.js'],
      }],
    }))).toThrow()
  })

  it('requires deferred capability and measurements to agree', () => {
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      capabilities: ['route.initialAssets.v1'],
    }))).toThrow('route.deferredAssets.v1')
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      routes: validSnapshot.routes.map((route) => ({
        ...route,
        deferredAssets: null,
        deferredRawBytes: null,
        deferredGzipBytes: null,
      })),
    }))).toThrow('route.deferredAssets.v1')
  })

  it('rejects overlapping or incorrectly totaled deferred assets', () => {
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      routes: validSnapshot.routes.map((route) => ({
        ...route,
        deferredAssets: [
          'static/chunks/app/page.js',
          'static/chunks/deferred.js',
        ],
        deferredRawBytes: 15,
        deferredGzipBytes: 35,
      })),
    }))).toThrow('both initial and deferred')
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      routes: validSnapshot.routes.map((route) => ({
        ...route,
        deferredRawBytes: 6,
      })),
    }))).toThrow('Deferred asset sizes do not match')
  })

  it('rejects duplicate deferred asset references', () => {
    expect(() => parseSnapshotJson(JSON.stringify({
      ...validSnapshot,
      routes: validSnapshot.routes.map((route) => ({
        ...route,
        deferredAssets: [
          'static/chunks/deferred.js',
          'static/chunks/deferred.js',
        ],
        deferredRawBytes: 10,
        deferredGzipBytes: 30,
      })),
    }))).toThrow('duplicates')
  })

  it('rejects input above the configured byte limit before parsing', () => {
    expect(() => parseSnapshotJson(' '.repeat(11), 10)).toThrow('exceeds 10 bytes')
  })
})
