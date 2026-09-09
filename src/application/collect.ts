import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

import { measure } from '../analysis/measure.js'
import { collectAppRouterBuild } from '../collectors/app-router-manifests.js'
import { collectEmittedClientAssets } from '../collectors/emitted-client-assets.js'
import { collectPagesBuild } from '../collectors/pages-build-manifest.js'
import { collectRouteBundleStats } from '../collectors/route-bundle-stats.js'
import type { BundleSnapshot, SnapshotIdentity } from '../contracts/index.js'
import type { CollectedBuild } from '../contracts/index.js'

export interface CollectOptions {
  strict?: boolean
}

function mergeBuilds(
  app: CollectedBuild,
  pages: CollectedBuild,
): CollectedBuild {
  const routes = [...app.routes, ...pages.routes]
  const duplicate = routes.find(
    (route, index) => routes.findIndex((item) => item.path === route.path) !== index,
  )
  if (duplicate) {
    throw new Error(`Route is present in both App and Pages Router: ${duplicate.path}`)
  }

  const assets = new Map(app.assets.map((asset) => [asset.id, asset]))
  for (const asset of pages.assets) {
    const existing = assets.get(asset.id)
    if (
      existing &&
      (existing.rawBytes !== asset.rawBytes || existing.gzipBytes !== asset.gzipBytes)
    ) {
      throw new Error(`Collectors measured conflicting asset sizes: ${asset.id}`)
    }
    assets.set(asset.id, asset)
  }

  return {
    environment: {
      ...app.environment,
      routers: ['app', 'pages'],
    },
    capabilities: [
      ...app.capabilities.filter((capability) =>
        pages.capabilities.includes(capability),
      ),
      ...app.capabilities.filter((capability) =>
        capability === 'route.deferredAssets.v1',
      ),
    ],
    assets: [...assets.values()],
    routes,
    diagnostics: [...app.diagnostics, ...pages.diagnostics],
  }
}

export async function collect(
  buildPath: string,
  identity: SnapshotIdentity,
  options: CollectOptions = {},
): Promise<BundleSnapshot> {
  await access(buildPath)
  try {
    return measure(await collectSupportedBuild(buildPath), identity)
  } catch (error) {
    if (options.strict) throw error
    return measure(await collectEmittedClientAssets(buildPath, error), identity)
  }
}

async function collectSupportedBuild(buildPath: string): Promise<CollectedBuild> {
  const hasRouteBundleStats = await access(
    resolve(buildPath, 'diagnostics/route-bundle-stats.json'),
  ).then(
    () => true,
    () => false,
  )
  if (hasRouteBundleStats) {
    return collectRouteBundleStats(buildPath)
  }

  const hasAppRoutes = await access(
    resolve(buildPath, 'app-path-routes-manifest.json'),
  ).then(
    () => true,
    () => false,
  )
  let collected: CollectedBuild
  if (hasAppRoutes) {
    const app = await collectAppRouterBuild(buildPath)
    const pages = await collectPagesBuild(buildPath)
    collected = pages.routes.length > 0 ? mergeBuilds(app, pages) : app
  } else {
    collected = await collectPagesBuild(buildPath)
  }
  return collected
}
