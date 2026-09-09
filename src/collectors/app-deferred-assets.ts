import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface ClientModule {
  chunks?: unknown
}

interface LoadableEntry {
  files?: unknown
}

export interface AppRouteEvidence {
  internalRoute: string
  publicRoute: string
  initialAssets: string[]
  clientModules: Record<string, ClientModule>
}

export interface AppDeferredAssets {
  byRoute: Map<string, string[]>
}

const MAX_MANIFEST_BYTES = 5 * 1024 * 1024

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Expected ${field} to be an array of strings`)
  }
  return value
}

function stripAssetPrefix(sourceId: string): string {
  const slashId = sourceId.replaceAll('\\', '/')
  const prefixes = ['./.next/', '.next/', './', '/_next/']
  const prefix = prefixes.find((candidate) => slashId.startsWith(candidate))
  return prefix ? slashId.slice(prefix.length) : slashId
}

function normalizeDeferredAssetId(sourceId: string): string {
  const assetId = stripAssetPrefix(sourceId)
  if (!assetId.startsWith('static/chunks/') || !assetId.endsWith('.js')) {
    throw new Error(`Unexpected deferred asset path: ${sourceId}`)
  }
  return assetId
}

async function readJson(path: string): Promise<unknown> {
  const source = await readFile(path, 'utf8')
  if (Buffer.byteLength(source) > MAX_MANIFEST_BYTES) {
    throw new Error('React loadable manifest exceeds 5 MiB')
  }
  return JSON.parse(source) as unknown
}

function loadableFiles(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid react loadable manifest entry')
  }
  return stringArray((value as LoadableEntry).files, 'loadable files')
    .filter((file) => file.endsWith('.js'))
    .map(normalizeDeferredAssetId)
}

function routeEntryAsset(sourceId: string, internalRoute: string): boolean {
  const assetId = stripAssetPrefix(sourceId)
  let decoded: string
  try {
    decoded = decodeURIComponent(assetId)
  } catch {
    throw new Error(`Invalid URL encoding in asset path: ${sourceId}`)
  }
  if (!decoded.startsWith('static/chunks/app/') || !decoded.endsWith('.js')) {
    return false
  }
  const withoutHash = decoded
    .slice('static/chunks/app/'.length, -'.js'.length)
    .replace(/-[a-z0-9]+$/i, '')
  return withoutHash === internalRoute.replace(/^\//, '')
}

function sourceModule(loadableKey: string): string {
  const separator = ' -> '
  const index = loadableKey.indexOf(separator)
  if (index < 1) {
    throw new Error(`Invalid react loadable manifest key: ${loadableKey}`)
  }
  return loadableKey.slice(0, index).replaceAll('\\', '/')
}

function sameModule(clientModule: string, source: string): boolean {
  const normalized = clientModule
    .replace(/ <module evaluation>$/, '')
    .replaceAll('\\', '/')
  return normalized === source || normalized.endsWith(`/${source}`)
}

async function webpackDeferredByRoute(
  buildPath: string,
  routes: AppRouteEvidence[],
): Promise<Map<string, string[]>> {
  const rawManifest = await readJson(
    resolve(buildPath, 'react-loadable-manifest.json'),
  )
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    throw new Error('react-loadable-manifest.json must contain an object')
  }
  const manifest = Object.entries(rawManifest)

  return new Map(routes.map((route) => {
    const routeModules = Object.entries(route.clientModules)
      .filter(([, module]) => stringArray(
        module.chunks ?? [],
        'clientModules[].chunks',
      ).some((chunk) => routeEntryAsset(chunk, route.internalRoute)))
      .map(([moduleId]) => moduleId)
    const initialAssets = new Set(route.initialAssets)
    const deferredAssets = manifest.flatMap(([key, entry]) => {
      const source = sourceModule(key)
      return routeModules.some((moduleId) => sameModule(moduleId, source))
        ? loadableFiles(entry)
        : []
    }).filter((assetId) => !initialAssets.has(assetId))

    return [route.publicRoute, [...new Set(deferredAssets)]]
  }))
}

async function turbopackDeferredByRoute(
  buildPath: string,
  routes: AppRouteEvidence[],
): Promise<Map<string, string[]>> {
  return new Map(await Promise.all(routes.map(async (route) => {
    const manifestPath = resolve(
      buildPath,
      'server/app',
      route.internalRoute.replace(/^\//, ''),
      'react-loadable-manifest.json',
    )
    const rawManifest = await readJson(manifestPath)
    if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
      throw new Error(`${manifestPath} must contain an object`)
    }
    const initialAssets = new Set(route.initialAssets)
    const deferredAssets = Object.values(rawManifest)
      .flatMap(loadableFiles)
      .filter((assetId) => !initialAssets.has(assetId))
    return [route.publicRoute, [...new Set(deferredAssets)]] as [string, string[]]
  })))
}

export async function collectAppDeferredAssets(
  buildPath: string,
  routes: AppRouteEvidence[],
): Promise<AppDeferredAssets> {
  const hasWebpackManifest = await access(
    resolve(buildPath, 'react-loadable-manifest.json'),
  ).then(
    () => true,
    () => false,
  )
  const byRoute = hasWebpackManifest
    ? await webpackDeferredByRoute(buildPath, routes)
    : await turbopackDeferredByRoute(buildPath, routes)
  return { byRoute }
}
