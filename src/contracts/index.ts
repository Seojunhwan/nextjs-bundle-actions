export const SCHEMA_VERSION = 2 as const
export const METRIC_DEFINITION_VERSION = 1 as const

export interface SnapshotIdentity {
  repository: string
  projectId: string
  commitSha: string
}

export interface AssetFact {
  id: string
  rawBytes: number
  gzipBytes: number
}

export interface CollectedRoute {
  path: string
  initialAssets: string[]
  deferredAssets: string[] | null
}

export interface CollectedBuild {
  environment: {
    nextVersion: string | null
    bundler: 'webpack' | 'turbopack' | 'unknown'
    routers: Array<'app' | 'pages'>
  }
  capabilities: string[]
  assets: AssetFact[]
  routes: CollectedRoute[]
  diagnostics: string[]
}

export interface RouteSnapshot extends CollectedRoute {
  rawBytes: number
  gzipBytes: number
  routeSpecificRawBytes: number
  routeSpecificGzipBytes: number
  sharedRawBytes: number
  sharedGzipBytes: number
  deferredRawBytes: number | null
  deferredGzipBytes: number | null
}

export interface BundleSnapshot {
  schemaVersion: 1 | typeof SCHEMA_VERSION
  metricDefinitionVersion: typeof METRIC_DEFINITION_VERSION
  identity: SnapshotIdentity
  environment: CollectedBuild['environment']
  capabilities: string[]
  assets: AssetFact[]
  routes: RouteSnapshot[]
  diagnostics: string[]
}

export type RouteChangeStatus = 'changed' | 'added' | 'removed' | 'unchanged'
export type DeferredRouteChangeStatus = RouteChangeStatus | 'unavailable'

export interface RouteDiff {
  path: string
  status: RouteChangeStatus
  baseRawBytes: number | null
  headRawBytes: number | null
  rawDeltaBytes: number
  rawDeltaPercentage: number | null
  baseGzipBytes: number | null
  headGzipBytes: number | null
  gzipDeltaBytes: number
  gzipDeltaPercentage: number | null
}

export interface DeferredRouteDiff {
  path: string
  status: DeferredRouteChangeStatus
  baseAssetCount: number | null
  headAssetCount: number | null
  baseRawBytes: number | null
  headRawBytes: number | null
  rawDeltaBytes: number | null
  rawDeltaPercentage: number | null
  baseGzipBytes: number | null
  headGzipBytes: number | null
  gzipDeltaBytes: number | null
  gzipDeltaPercentage: number | null
}

export interface BundleDiff {
  compatible: boolean
  base: SnapshotIdentity
  head: SnapshotIdentity
  routes: RouteDiff[]
  deferredRoutes: DeferredRouteDiff[]
  diagnostics: string[]
}

export interface BudgetPolicy {
  maxGzipBytes?: number
  maxGzipDeltaBytes?: number
  maxGzipDeltaPercentage?: number
}

export type BudgetRule = keyof BudgetPolicy

export interface BudgetViolation {
  path: string
  rule: BudgetRule
  actual: number
  limit: number
}

export interface Evaluation {
  status: 'pass' | 'fail' | 'skipped'
  violations: BudgetViolation[]
}
