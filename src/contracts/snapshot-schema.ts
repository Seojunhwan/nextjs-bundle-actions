import { z } from 'zod'

import type { BundleSnapshot } from './index.js'

export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024

const limitedString = z.string().min(1).max(2048)
const byteCount = z.number().int().nonnegative().finite()
const assetId = limitedString.refine((value) => {
  if (value.includes('\\') || value.startsWith('/')) return false
  const segments = value.split('/')
  return value.startsWith('static/') &&
    value.endsWith('.js') &&
    segments.every((segment) => segment && segment !== '.' && segment !== '..')
}, 'Asset ID must be a safe static JavaScript path')

const identitySchema = z.object({
  repository: limitedString,
  projectId: limitedString,
  commitSha: limitedString,
}).strict()

const assetSchema = z.object({
  id: assetId,
  rawBytes: byteCount,
  gzipBytes: byteCount,
}).strict()

const routeV1Schema = z.object({
  path: limitedString,
  initialAssets: z.array(assetId).max(100_000),
  rawBytes: byteCount,
  gzipBytes: byteCount,
  routeSpecificRawBytes: byteCount,
  routeSpecificGzipBytes: byteCount,
  sharedRawBytes: byteCount,
  sharedGzipBytes: byteCount,
}).strict()

const routeV2Schema = routeV1Schema.extend({
  deferredAssets: z.array(assetId).max(100_000).nullable(),
  deferredRawBytes: byteCount.nullable(),
  deferredGzipBytes: byteCount.nullable(),
}).strict()

const snapshotFields = {
  metricDefinitionVersion: z.literal(1),
  identity: identitySchema,
  environment: z.object({
    nextVersion: z.string().max(100).nullable(),
    bundler: z.enum(['webpack', 'turbopack', 'unknown']),
    routers: z.array(z.enum(['app', 'pages'])).max(2),
  }).strict(),
  capabilities: z.array(limitedString).max(100),
  assets: z.array(assetSchema).max(100_000),
  diagnostics: z.array(z.string().max(4096)).max(1_000),
}

const snapshotV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...snapshotFields,
  routes: z.array(routeV1Schema).max(20_000),
}).strict()

const snapshotV2Schema = z.object({
  schemaVersion: z.literal(2),
  ...snapshotFields,
  routes: z.array(routeV2Schema).max(20_000),
}).strict()

export const bundleSnapshotSchema = z.discriminatedUnion('schemaVersion', [
  snapshotV1Schema,
  snapshotV2Schema,
]).superRefine((snapshot, context) => {
  const measuredAssets = new Map(snapshot.assets.map((asset) => [asset.id, asset]))
  for (const [index, route] of snapshot.routes.entries()) {
    for (const referencedAsset of route.initialAssets) {
      if (!measuredAssets.has(referencedAsset)) {
        context.addIssue({
          code: 'custom',
          path: ['routes', index],
          message: `Route references an unmeasured asset: ${referencedAsset}`,
        })
      }
    }
  }
  if (snapshot.schemaVersion === 2) {
    const hasDeferredCapability = snapshot.capabilities.includes(
      'route.deferredAssets.v1',
    )
    const hasDeferredMeasurements = snapshot.routes.some(
      (route) => route.deferredAssets !== null,
    )
    if (hasDeferredCapability !== hasDeferredMeasurements) {
      context.addIssue({
        code: 'custom',
        path: ['capabilities'],
        message: 'route.deferredAssets.v1 must match deferred route measurements',
      })
    }
    for (const [index, route] of snapshot.routes.entries()) {
      for (const referencedAsset of route.deferredAssets ?? []) {
        if (!measuredAssets.has(referencedAsset)) {
          context.addIssue({
            code: 'custom',
            path: ['routes', index],
            message: `Route references an unmeasured asset: ${referencedAsset}`,
          })
        }
      }
      const allUnavailable = route.deferredAssets === null &&
        route.deferredRawBytes === null &&
        route.deferredGzipBytes === null
      const allAvailable = route.deferredAssets !== null &&
        route.deferredRawBytes !== null &&
        route.deferredGzipBytes !== null
      if (!allUnavailable && !allAvailable) {
        context.addIssue({
          code: 'custom',
          path: ['routes', index],
          message: 'Deferred asset IDs and sizes must be available together',
        })
      }
      if (route.deferredAssets !== null) {
        if (new Set(route.deferredAssets).size !== route.deferredAssets.length) {
          context.addIssue({
            code: 'custom',
            path: ['routes', index, 'deferredAssets'],
            message: 'Deferred asset references must not contain duplicates',
          })
        }
        const initialAssets = new Set(route.initialAssets)
        const overlap = route.deferredAssets.find((asset) =>
          initialAssets.has(asset),
        )
        if (overlap) {
          context.addIssue({
            code: 'custom',
            path: ['routes', index, 'deferredAssets'],
            message: `Asset appears in both initial and deferred sets: ${overlap}`,
          })
        }
        const deferredFacts = route.deferredAssets
          .map((asset) => measuredAssets.get(asset))
          .filter((asset) => asset !== undefined)
        const rawBytes = deferredFacts.reduce(
          (sum, asset) => sum + asset.rawBytes,
          0,
        )
        const gzipBytes = deferredFacts.reduce(
          (sum, asset) => sum + asset.gzipBytes,
          0,
        )
        if (
          deferredFacts.length === route.deferredAssets.length &&
          (rawBytes !== route.deferredRawBytes ||
            gzipBytes !== route.deferredGzipBytes)
        ) {
          context.addIssue({
            code: 'custom',
            path: ['routes', index],
            message: 'Deferred asset sizes do not match referenced asset facts',
          })
        }
      }
    }
  }
}).transform((snapshot): BundleSnapshot => snapshot.schemaVersion === 1
  ? {
      ...snapshot,
      routes: snapshot.routes.map((route) => ({
        ...route,
        deferredAssets: null,
        deferredRawBytes: null,
        deferredGzipBytes: null,
      })),
    }
  : snapshot)

export function parseSnapshotJson(
  source: string,
  maxBytes = MAX_SNAPSHOT_BYTES,
): BundleSnapshot {
  const sourceBytes = Buffer.byteLength(source)
  if (sourceBytes > maxBytes) {
    throw new Error(`Snapshot exceeds ${maxBytes} bytes`)
  }

  return bundleSnapshotSchema.parse(JSON.parse(source)) as BundleSnapshot
}
