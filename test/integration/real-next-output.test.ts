import { describe, expect, it } from 'vitest'

import { collect } from '../../src/index.js'

const identity = {
  repository: 'local/research-lab',
  projectId: 'web',
  commitSha: 'local-build',
}

describe('real Next.js 16.2.3 outputs', () => {
  it.skipIf(!process.env.NEXT_WEBPACK_BUILD_PATH)(
    'collects the independently inspected Webpack output',
    async () => {
      const snapshot = await collect(process.env.NEXT_WEBPACK_BUILD_PATH!, identity, {
        strict: true,
      })
      expect(snapshot.environment.bundler).toBe('webpack')
      expect(Object.fromEntries(snapshot.routes.map((route) => [route.path, route.rawBytes])))
        .toEqual({
          '/': 538_250,
          '/dashboard': 541_680,
          '/products/[id]': 538_048,
        })
      expect(Object.fromEntries(snapshot.routes.map((route) => [
        route.path,
        {
          assets: route.deferredAssets,
          rawBytes: route.deferredRawBytes,
          gzipBytes: route.deferredGzipBytes,
        },
      ]))).toEqual({
        '/': { assets: [], rawBytes: 0, gzipBytes: 0 },
        '/dashboard': {
          assets: ['static/chunks/41.d1548a2908bf71fb.js'],
          rawBytes: 423,
          gzipBytes: 331,
        },
        '/products/[id]': { assets: [], rawBytes: 0, gzipBytes: 0 },
      })
    },
  )

  it.skipIf(!process.env.NEXT_TURBOPACK_BUILD_PATH)(
    'collects the independently inspected Turbopack output',
    async () => {
      const snapshot = await collect(process.env.NEXT_TURBOPACK_BUILD_PATH!, identity, {
        strict: true,
      })
      expect(snapshot.environment.bundler).toBe('turbopack')
      expect(Object.fromEntries(snapshot.routes.map((route) => [route.path, route.rawBytes])))
        .toEqual({
          '/': 626_733,
          '/dashboard': 630_115,
          '/products/[id]': 626_573,
        })
      expect(Object.fromEntries(snapshot.routes.map((route) => [
        route.path,
        {
          assets: route.deferredAssets,
          rawBytes: route.deferredRawBytes,
          gzipBytes: route.deferredGzipBytes,
        },
      ]))).toEqual({
        '/': { assets: [], rawBytes: 0, gzipBytes: 0 },
        '/dashboard': {
          assets: ['static/chunks/17ho0lpvwqk6-.js'],
          rawBytes: 484,
          gzipBytes: 371,
        },
        '/products/[id]': { assets: [], rawBytes: 0, gzipBytes: 0 },
      })
    },
  )

  it.skipIf(!process.env.NEXT_PAGES_WEBPACK_BUILD_PATH)(
    'collects all initial scripts from the Pages Router Webpack output',
    async () => {
      const snapshot = await collect(
        process.env.NEXT_PAGES_WEBPACK_BUILD_PATH!,
        identity,
        { strict: true },
      )
      expect(snapshot.environment).toEqual({
        nextVersion: '16.2.3',
        bundler: 'webpack',
        routers: ['pages'],
      })
      expect(snapshot.routes.find((route) => route.path === '/')?.rawBytes)
        .toBe(455_976)
    },
  )

  it.skipIf(!process.env.NEXT_PAGES_TURBOPACK_BUILD_PATH)(
    'collects all initial scripts from the Pages Router Turbopack output',
    async () => {
      const snapshot = await collect(
        process.env.NEXT_PAGES_TURBOPACK_BUILD_PATH!,
        identity,
        { strict: true },
      )
      expect(snapshot.environment).toEqual({
        nextVersion: '16.2.3',
        bundler: 'turbopack',
        routers: ['pages'],
      })
      expect(snapshot.routes.find((route) => route.path === '/')?.rawBytes)
        .toBe(381_089)
    },
  )

  for (const [bundler, environmentName] of [
    ['webpack', 'NEXT_MIXED_WEBPACK_BUILD_PATH'],
    ['turbopack', 'NEXT_MIXED_TURBOPACK_BUILD_PATH'],
  ] as const) {
    it.skipIf(!process.env[environmentName])(
      `collects a mixed-router ${bundler} output`,
      async () => {
        const snapshot = await collect(
          process.env[environmentName]!,
          identity,
          { strict: true },
        )
        expect(snapshot.environment.bundler).toBe(bundler)
        expect(snapshot.environment.routers).toEqual(['app', 'pages'])
        expect(snapshot.routes.map((route) => route.path).sort())
          .toEqual(['/', '/app-home'])
      },
    )
  }
})
