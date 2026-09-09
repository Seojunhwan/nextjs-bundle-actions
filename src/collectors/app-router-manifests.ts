import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import type {
  AssetFact,
  CollectedBuild,
  CollectedRoute,
} from '../contracts/index.js'
import {
  collectAppDeferredAssets,
  type AppRouteEvidence,
} from './app-deferred-assets.js'
import { readBuildEnvironment } from './environment.js'

interface BuildManifest {
  rootMainFiles?: unknown
  polyfillFiles?: unknown
}

interface ClientModule {
  chunks?: unknown
}

interface ClientReferenceManifest {
  clientModules?: Record<string, ClientModule>
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Expected ${field} to be an array of strings`)
  }
  return value
}

function decodeAssetId(assetId: string): string {
  try {
    return decodeURIComponent(assetId)
  } catch {
    throw new Error(`Invalid URL encoding in asset path: ${assetId}`)
  }
}

function routeEntryAsset(assetId: string, internalRoute: string): boolean {
  const decoded = decodeAssetId(assetId)
  if (!decoded.startsWith('static/chunks/app/') || !decoded.endsWith('.js')) {
    return false
  }

  const withoutHash = decoded
    .slice('static/chunks/app/'.length, -'.js'.length)
    .replace(/-[a-z0-9]+$/i, '')

  return withoutHash === internalRoute.replace(/^\//, '')
}

function parseClientReference(source: string): ClientReferenceManifest {
  if (source.length > 5 * 1024 * 1024) {
    throw new Error('Client reference manifest exceeds 5 MiB')
  }
  const assignment = /globalThis\.__RSC_MANIFEST\s*\[\s*"(?:\\.|[^"\\])*"\s*\]\s*=\s*/g
    .exec(source)
  if (!assignment) {
    throw new Error('Client reference manifest payload was not found')
  }
  const payload = source
    .slice((assignment.index ?? 0) + assignment[0].length)
    .trim()
    .replace(/;\s*$/, '')
  return JSON.parse(payload) as ClientReferenceManifest
}

function safeAssetPath(buildPath: string, assetId: string): string {
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

export async function collectAppRouterBuild(
  buildPath: string,
): Promise<CollectedBuild> {
  const [routeSource, buildSource] = await Promise.all([
    readFile(resolve(buildPath, 'app-path-routes-manifest.json'), 'utf8'),
    readFile(resolve(buildPath, 'build-manifest.json'), 'utf8'),
  ])
  const routeMap = JSON.parse(routeSource) as Record<string, unknown>
  const buildManifest = JSON.parse(buildSource) as BuildManifest
  const roots = [
    ...stringArray(buildManifest.rootMainFiles, 'rootMainFiles'),
    ...stringArray(buildManifest.polyfillFiles, 'polyfillFiles'),
  ].filter((asset) => asset.endsWith('.js'))

  const routes: CollectedRoute[] = []
  const routeEvidence: AppRouteEvidence[] = []
  for (const [internalRoute, publicRoute] of Object.entries(routeMap)) {
    if (typeof publicRoute !== 'string') {
      throw new Error(`Invalid public route for ${internalRoute}`)
    }
    if (!internalRoute.endsWith('/page')) continue
    if (publicRoute === '/_not-found' || publicRoute === '/_global-error') continue

    const manifestPath = resolve(
      buildPath,
      'server/app',
      `${internalRoute.replace(/^\//, '')}_client-reference-manifest.js`,
    )
    const manifest = parseClientReference(await readFile(manifestPath, 'utf8'))
    const routeAssets = Object.values(manifest.clientModules ?? {}).flatMap(
      (module) => {
        const chunks = stringArray(module.chunks ?? [], 'clientModules[].chunks')
          .filter((chunk) => chunk.endsWith('.js'))
        return chunks.some((chunk) => routeEntryAsset(chunk, internalRoute))
          ? chunks
          : []
      },
    )

    const initialAssets = [
      ...new Set([...roots, ...routeAssets.map(decodeAssetId)]),
    ]
    routes.push({
      path: publicRoute,
      initialAssets,
      deferredAssets: [],
    })
    routeEvidence.push({
      internalRoute,
      publicRoute,
      initialAssets,
      clientModules: manifest.clientModules ?? {},
    })
  }

  const deferred = await collectAppDeferredAssets(buildPath, routeEvidence)
  for (const route of routes) {
    route.deferredAssets = deferred.byRoute.get(route.path) ?? []
  }
  const assetIds = [...new Set(routes.flatMap((route) => [
    ...route.initialAssets,
    ...(route.deferredAssets ?? []),
  ]))]
  const assets: AssetFact[] = await Promise.all(
    assetIds.map(async (id) => {
      const content = await readFile(safeAssetPath(buildPath, id))
      return {
        id,
        rawBytes: content.byteLength,
        gzipBytes: gzipSync(content, { level: 9 }).byteLength,
      }
    }),
  )

  return {
    environment: await readBuildEnvironment(buildPath, ['app']),
    capabilities: [
      'asset.rawBytes.v1',
      'asset.gzipBytes.v1',
      'route.initialAssets.v1',
      'route.deferredAssets.v1',
    ],
    assets,
    routes,
    diagnostics: [],
  }
}
