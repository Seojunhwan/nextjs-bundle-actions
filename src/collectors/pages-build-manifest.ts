import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import type {
  AssetFact,
  CollectedBuild,
  CollectedRoute,
} from '../contracts/index.js'
import { readBuildEnvironment } from './environment.js'

interface PagesBuildManifest {
  pages?: Record<string, unknown>
  polyfillFiles?: unknown
  lowPriorityFiles?: unknown
}

const INTERNAL_ROUTES = new Set([
  '/_app',
  '/_document',
  '/_error',
  '/404',
  '/500',
])

function javascriptAssets(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Expected ${field} to be an array of strings`)
  }
  return value.filter((asset) => asset.endsWith('.js'))
}

function resolveAsset(buildPath: string, assetId: string): string {
  const absoluteBuildPath = resolve(buildPath)
  const absoluteAssetPath = resolve(absoluteBuildPath, assetId)
  const relativeAssetPath = relative(absoluteBuildPath, absoluteAssetPath)

  if (
    isAbsolute(relativeAssetPath) ||
    relativeAssetPath === '..' ||
    relativeAssetPath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new Error(`Asset path escapes the build directory: ${assetId}`)
  }

  return absoluteAssetPath
}

export async function collectPagesBuild(
  buildPath: string,
): Promise<CollectedBuild> {
  const manifestPath = resolve(buildPath, 'build-manifest.json')
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as PagesBuildManifest

  if (!manifest.pages || typeof manifest.pages !== 'object') {
    throw new Error('build-manifest.json does not contain a pages map')
  }
  const appAssets = javascriptAssets(manifest.pages['/_app'] ?? [], 'pages[/_app]')
  const commonAssets = [
    ...javascriptAssets(manifest.polyfillFiles ?? [], 'polyfillFiles'),
    ...appAssets,
  ]
  const lowPriorityAssets = javascriptAssets(
    manifest.lowPriorityFiles ?? [],
    'lowPriorityFiles',
  )

  const routes: CollectedRoute[] = Object.entries(manifest.pages)
    .filter(([path]) => !INTERNAL_ROUTES.has(path) && !path.startsWith('/api/'))
    .map(
    ([path, value]) => {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw new Error(`Invalid asset list for route: ${path}`)
      }

      return {
        path,
        initialAssets: [
          ...new Set([
            ...commonAssets,
            ...value.filter((asset) => asset.endsWith('.js')),
            ...lowPriorityAssets,
          ]),
        ],
      }
    },
    )

  const assetIds = [...new Set(routes.flatMap((route) => route.initialAssets))]
  const assets: AssetFact[] = await Promise.all(
    assetIds.map(async (id) => {
      const content = await readFile(resolveAsset(buildPath, id))
      return {
        id,
        rawBytes: content.byteLength,
        gzipBytes: gzipSync(content, { level: 9 }).byteLength,
      }
    }),
  )

  return {
    environment: await readBuildEnvironment(buildPath, ['pages']),
    capabilities: [
      'asset.rawBytes.v1',
      'asset.gzipBytes.v1',
      'route.initialAssets.v1',
    ],
    assets,
    routes,
    diagnostics: [],
  }
}
