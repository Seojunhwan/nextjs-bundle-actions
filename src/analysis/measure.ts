import {
  METRIC_DEFINITION_VERSION,
  SCHEMA_VERSION,
  type BundleSnapshot,
  type CollectedBuild,
  type SnapshotIdentity,
} from '../contracts/index.js'

export function measure(
  collected: CollectedBuild,
  identity: SnapshotIdentity,
): BundleSnapshot {
  const assetsById = new Map(collected.assets.map((asset) => [asset.id, asset]))
  const referenceCounts = new Map<string, number>()

  for (const route of collected.routes) {
    for (const assetId of new Set(route.initialAssets)) {
      referenceCounts.set(assetId, (referenceCounts.get(assetId) ?? 0) + 1)
    }
  }

  const routes = collected.routes.map((route) => {
    const assets = route.initialAssets.map((assetId) => {
      const asset = assetsById.get(assetId)
      if (!asset) throw new Error(`Missing measured asset: ${assetId}`)
      return asset
    })
    const routeSpecific = assets.filter(
      (asset) => referenceCounts.get(asset.id) === 1,
    )
    const shared = assets.filter((asset) => (referenceCounts.get(asset.id) ?? 0) > 1)

    return {
      ...route,
      rawBytes: assets.reduce((sum, asset) => sum + asset.rawBytes, 0),
      gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
      routeSpecificRawBytes: routeSpecific.reduce(
        (sum, asset) => sum + asset.rawBytes,
        0,
      ),
      routeSpecificGzipBytes: routeSpecific.reduce(
        (sum, asset) => sum + asset.gzipBytes,
        0,
      ),
      sharedRawBytes: shared.reduce((sum, asset) => sum + asset.rawBytes, 0),
      sharedGzipBytes: shared.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    }
  })

  return {
    schemaVersion: SCHEMA_VERSION,
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    identity,
    environment: collected.environment,
    capabilities: collected.capabilities,
    assets: collected.assets,
    routes,
    diagnostics: collected.diagnostics,
  }
}
