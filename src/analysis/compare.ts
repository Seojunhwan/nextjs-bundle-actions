import type {
  BundleDiff,
  BundleSnapshot,
  DeferredRouteChangeStatus,
  DeferredRouteDiff,
  RouteChangeStatus,
  RouteDiff,
  RouteSnapshot,
} from '../contracts/index.js'

function percentage(base: number, delta: number): number | null {
  return base === 0 ? null : (delta / base) * 100
}

interface DeferredMetrics {
  assetCount: number | null
  rawBytes: number | null
  gzipBytes: number | null
}

function deferredMetrics(
  snapshot: BundleSnapshot,
  route: RouteSnapshot | undefined,
): DeferredMetrics {
  if (route) {
    return {
      assetCount: route.deferredAssets?.length ?? null,
      rawBytes: route.deferredRawBytes,
      gzipBytes: route.deferredGzipBytes,
    }
  }
  return snapshot.capabilities.includes('route.deferredAssets.v1')
    ? { assetCount: 0, rawBytes: 0, gzipBytes: 0 }
    : { assetCount: null, rawBytes: null, gzipBytes: null }
}

function deferredRouteDiff(
  path: string,
  baseSnapshot: BundleSnapshot,
  headSnapshot: BundleSnapshot,
  base: RouteSnapshot | undefined,
  head: RouteSnapshot | undefined,
): DeferredRouteDiff {
  const baseMetrics = deferredMetrics(baseSnapshot, base)
  const headMetrics = deferredMetrics(headSnapshot, head)
  const available = baseMetrics.rawBytes !== null &&
    baseMetrics.gzipBytes !== null &&
    headMetrics.rawBytes !== null &&
    headMetrics.gzipBytes !== null
  const rawDeltaBytes = available
    ? headMetrics.rawBytes! - baseMetrics.rawBytes!
    : null
  const gzipDeltaBytes = available
    ? headMetrics.gzipBytes! - baseMetrics.gzipBytes!
    : null
  let status: DeferredRouteChangeStatus
  if (!available) status = 'unavailable'
  else if (baseMetrics.gzipBytes === 0 && headMetrics.gzipBytes! > 0) status = 'added'
  else if (baseMetrics.gzipBytes! > 0 && headMetrics.gzipBytes === 0) status = 'removed'
  else if (rawDeltaBytes === 0 && gzipDeltaBytes === 0) status = 'unchanged'
  else status = 'changed'

  return {
    path,
    status,
    baseAssetCount: baseMetrics.assetCount,
    headAssetCount: headMetrics.assetCount,
    baseRawBytes: baseMetrics.rawBytes,
    headRawBytes: headMetrics.rawBytes,
    rawDeltaBytes,
    rawDeltaPercentage: rawDeltaBytes === null || baseMetrics.rawBytes === null
      ? null
      : percentage(baseMetrics.rawBytes, rawDeltaBytes),
    baseGzipBytes: baseMetrics.gzipBytes,
    headGzipBytes: headMetrics.gzipBytes,
    gzipDeltaBytes,
    gzipDeltaPercentage: gzipDeltaBytes === null || baseMetrics.gzipBytes === null
      ? null
      : percentage(baseMetrics.gzipBytes, gzipDeltaBytes),
  }
}

function routeDiff(
  path: string,
  base: RouteSnapshot | undefined,
  head: RouteSnapshot | undefined,
): RouteDiff {
  const baseRawBytes = base?.rawBytes ?? null
  const headRawBytes = head?.rawBytes ?? null
  const baseGzipBytes = base?.gzipBytes ?? null
  const headGzipBytes = head?.gzipBytes ?? null
  const rawDeltaBytes = (headRawBytes ?? 0) - (baseRawBytes ?? 0)
  const gzipDeltaBytes = (headGzipBytes ?? 0) - (baseGzipBytes ?? 0)
  let status: RouteChangeStatus

  if (!base) status = 'added'
  else if (!head) status = 'removed'
  else if (rawDeltaBytes === 0 && gzipDeltaBytes === 0) status = 'unchanged'
  else status = 'changed'

  return {
    path,
    status,
    baseRawBytes,
    headRawBytes,
    rawDeltaBytes,
    rawDeltaPercentage: base ? percentage(base.rawBytes, rawDeltaBytes) : null,
    baseGzipBytes,
    headGzipBytes,
    gzipDeltaBytes,
    gzipDeltaPercentage: base ? percentage(base.gzipBytes, gzipDeltaBytes) : null,
  }
}

export function compare(
  base: BundleSnapshot,
  head: BundleSnapshot,
): BundleDiff {
  const compatible =
    base.metricDefinitionVersion === head.metricDefinitionVersion &&
    base.capabilities.includes('route.initialAssets.v1') &&
    head.capabilities.includes('route.initialAssets.v1')

  if (!compatible) {
    return {
      compatible: false,
      base: base.identity,
      head: head.identity,
      routes: [],
      deferredRoutes: [],
      diagnostics: ['Route metrics are not compatible'],
    }
  }

  const baseRoutes = new Map(base.routes.map((route) => [route.path, route]))
  const headRoutes = new Map(head.routes.map((route) => [route.path, route]))
  const paths = new Set([...baseRoutes.keys(), ...headRoutes.keys()])
  const statusOrder: Record<RouteChangeStatus, number> = {
    changed: 0,
    added: 1,
    removed: 2,
    unchanged: 3,
  }

  const routes = [...paths]
    .map((path) => routeDiff(path, baseRoutes.get(path), headRoutes.get(path)))
    .sort(
      (left, right) =>
        statusOrder[left.status] - statusOrder[right.status] ||
        left.path.localeCompare(right.path),
    )
  const deferredRoutes = [...paths]
    .map((path) => deferredRouteDiff(
      path,
      base,
      head,
      baseRoutes.get(path),
      headRoutes.get(path),
    ))
    .sort(
      (left, right) =>
        statusOrder[left.status === 'unavailable' ? 'changed' : left.status] -
          statusOrder[right.status === 'unavailable' ? 'changed' : right.status] ||
        left.path.localeCompare(right.path),
    )

  return {
    compatible: true,
    base: base.identity,
    head: head.identity,
    routes,
    deferredRoutes,
    diagnostics: [],
  }
}
