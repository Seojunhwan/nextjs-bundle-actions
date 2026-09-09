import { access, readFile } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import type {
  AssetFact,
  CollectedBuild,
  CollectedRoute,
} from '../contracts/index.js'
import { collectAppDeferredAssets } from './app-deferred-assets.js'
import { readBuildEnvironment } from './environment.js'

interface RouteBundleStat {
  route?: unknown
  firstLoadUncompressedJsBytes?: unknown
  firstLoadChunkPaths?: unknown
}

interface BuildManifest {
  pages?: unknown
  polyfillFiles?: unknown
  lowPriorityFiles?: unknown
}

const INTERNAL_ROUTES = new Set([
  '/_app',
  '/_document',
  '/_error',
  '/_global-error',
  '/_not-found',
  '/404',
  '/500',
])

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Expected ${field} to be an array of strings`)
  }
  return value
}

function normalizeAssetId(buildPath: string, sourceId: string): string {
  const slashId = sourceId.replaceAll('\\', '/')
  const buildDirectory = basename(resolve(buildPath))
  const prefixes = [
    `./${buildDirectory}/`,
    `${buildDirectory}/`,
    './.next/',
    '.next/',
    './',
    '/_next/',
  ]
  const prefix = prefixes.find((candidate) => slashId.startsWith(candidate))
  const assetId = prefix ? slashId.slice(prefix.length) : slashId

  if (!assetId.startsWith('static/') || !assetId.endsWith('.js')) {
    throw new Error(`Unexpected route bundle asset path: ${sourceId}`)
  }
  return assetId
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

function userPages(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value).some(
    (route) => !INTERNAL_ROUTES.has(route) && !route.startsWith('/api/'),
  )
}

async function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  )
}

export async function collectRouteBundleStats(
  buildPath: string,
): Promise<CollectedBuild> {
  const [statsSource, buildSource] = await Promise.all([
    readFile(resolve(buildPath, 'diagnostics/route-bundle-stats.json'), 'utf8'),
    readFile(resolve(buildPath, 'build-manifest.json'), 'utf8'),
  ])
  const stats = JSON.parse(statsSource) as unknown
  const buildManifest = JSON.parse(buildSource) as BuildManifest
  if (!Array.isArray(stats)) {
    throw new Error('route-bundle-stats.json must contain an array')
  }

  const polyfills = stringArray(
    buildManifest.polyfillFiles ?? [],
    'polyfillFiles',
  ).filter((asset) => asset.endsWith('.js'))
  const lowPriorityFiles = stringArray(
    buildManifest.lowPriorityFiles ?? [],
    'lowPriorityFiles',
  ).filter((asset) => asset.endsWith('.js'))
  const appManifestPath = resolve(buildPath, 'app-path-routes-manifest.json')
  const hasAppRoutes = await exists(appManifestPath)
  const appRouteMap = new Map<string, string>()
  const appNonPageRouteSet = new Set<string>()
  if (hasAppRoutes) {
    const routeMap = JSON.parse(await readFile(appManifestPath, 'utf8')) as unknown
    if (!routeMap || typeof routeMap !== 'object' || Array.isArray(routeMap)) {
      throw new Error('app-path-routes-manifest.json must contain an object')
    }
    for (const [internalRoute, route] of Object.entries(routeMap)) {
      if (typeof route !== 'string') {
        throw new Error('Invalid route in app-path-routes-manifest.json')
      }
      if (internalRoute.endsWith('/page')) appRouteMap.set(route, internalRoute)
      else appNonPageRouteSet.add(route)
    }
  }
  const pageRouteSet = new Set(
    buildManifest.pages &&
      typeof buildManifest.pages === 'object' &&
      !Array.isArray(buildManifest.pages)
      ? Object.keys(buildManifest.pages).filter(
          (route) => !INTERNAL_ROUTES.has(route) && !route.startsWith('/api/'),
        )
      : [],
  )
  const routes: CollectedRoute[] = []
  const expectedRawBytes = new Map<string, number>()
  const measuredAssetsByRoute = new Map<string, string[]>()

  for (const rawStat of stats as RouteBundleStat[]) {
    if (
      typeof rawStat.route !== 'string' ||
      typeof rawStat.firstLoadUncompressedJsBytes !== 'number' ||
      !Number.isSafeInteger(rawStat.firstLoadUncompressedJsBytes) ||
      rawStat.firstLoadUncompressedJsBytes < 0
    ) {
      throw new Error('Invalid route entry in route-bundle-stats.json')
    }
    if (
      INTERNAL_ROUTES.has(rawStat.route) ||
      rawStat.route.startsWith('/api/') ||
      appNonPageRouteSet.has(rawStat.route)
    ) {
      continue
    }

    const measuredAssets = stringArray(
      rawStat.firstLoadChunkPaths,
      'firstLoadChunkPaths',
    ).map((asset) => normalizeAssetId(buildPath, asset))
    measuredAssetsByRoute.set(rawStat.route, measuredAssets)
    const isAppRoute = appRouteMap.has(rawStat.route)
    const isPagesRoute = pageRouteSet.has(rawStat.route)
    if (isAppRoute && isPagesRoute) {
      throw new Error(`Route is present in both App and Pages Router: ${rawStat.route}`)
    }
    routes.push({
      path: rawStat.route,
      initialAssets: [
        ...new Set([
          ...measuredAssets,
          ...polyfills,
          ...(isPagesRoute ? lowPriorityFiles : []),
        ]),
      ],
      deferredAssets: isAppRoute ? [] : null,
    })
    expectedRawBytes.set(rawStat.route, rawStat.firstLoadUncompressedJsBytes)
  }

  const appRouteEvidence = routes.flatMap((route) => {
    const internalRoute = appRouteMap.get(route.path)
    return internalRoute
      ? [{
          internalRoute,
          publicRoute: route.path,
          initialAssets: route.initialAssets,
          clientModules: {},
        }]
      : []
  })
  if (appRouteEvidence.length > 0) {
    const deferred = await collectAppDeferredAssets(buildPath, appRouteEvidence)
    for (const route of routes) {
      if (route.deferredAssets !== null) {
        route.deferredAssets = deferred.byRoute.get(route.path) ?? []
      }
    }
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
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]))
  for (const route of routes) {
    const observed = (measuredAssetsByRoute.get(route.path) ?? [])
      .reduce((sum, id) => sum + (assetsById.get(id)?.rawBytes ?? 0), 0)
    if (observed !== expectedRawBytes.get(route.path)) {
      throw new Error(
        `route-bundle-stats raw-byte mismatch for ${route.path}: expected ${expectedRawBytes.get(route.path)}, measured ${observed}`,
      )
    }
  }

  const routers: Array<'app' | 'pages'> = []
  if (hasAppRoutes) routers.push('app')
  if (pageRouteSet.size > 0 || userPages(buildManifest.pages)) routers.push('pages')

  const diagnostics: string[] = []
  if (polyfills.length > 0) {
    diagnostics.push(
      `route-bundle-stats.json excludes build polyfills; ${polyfills.length} polyfill asset${polyfills.length === 1 ? ' was' : 's were'} added to every route.`,
    )
  }
  if (lowPriorityFiles.length > 0 && pageRouteSet.size > 0) {
    diagnostics.push(
      `route-bundle-stats.json excludes Pages document manifests; ${lowPriorityFiles.length} low-priority asset${lowPriorityFiles.length === 1 ? ' was' : 's were'} added to Pages routes.`,
    )
  }
  if (pageRouteSet.size > 0) {
    diagnostics.push(
      'Deferred client JavaScript metrics are unavailable for Pages Router routes.',
    )
  }

  return {
    environment: await readBuildEnvironment(buildPath, routers),
    capabilities: [
      'asset.rawBytes.v1',
      'asset.gzipBytes.v1',
      'route.initialAssets.v1',
      ...(appRouteEvidence.length > 0 ? ['route.deferredAssets.v1'] : []),
    ],
    assets,
    routes,
    diagnostics,
  }
}
