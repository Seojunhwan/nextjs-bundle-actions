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
          '/': 538_138,
          '/dashboard': 538_148,
          '/products/[id]': 537_936,
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
          '/dashboard': 626_743,
          '/products/[id]': 626_573,
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
