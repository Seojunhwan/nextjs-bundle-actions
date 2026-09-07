import { z } from 'zod'

import type { BundleSnapshot } from './index.js'

export const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024

const limitedString = z.string().min(1).max(2048)
const byteCount = z.number().int().nonnegative().finite()

const identitySchema = z.object({
  repository: limitedString,
  projectId: limitedString,
  commitSha: limitedString,
}).strict()

const assetSchema = z.object({
  id: limitedString,
  rawBytes: byteCount,
  gzipBytes: byteCount,
}).strict()

const routeSchema = z.object({
  path: limitedString,
  initialAssets: z.array(limitedString).max(100_000),
  rawBytes: byteCount,
  gzipBytes: byteCount,
  routeSpecificRawBytes: byteCount,
  routeSpecificGzipBytes: byteCount,
  sharedRawBytes: byteCount,
  sharedGzipBytes: byteCount,
}).strict()

export const bundleSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  metricDefinitionVersion: z.literal(1),
  identity: identitySchema,
  environment: z.object({
    nextVersion: z.string().max(100).nullable(),
    bundler: z.enum(['webpack', 'turbopack', 'unknown']),
    routers: z.array(z.enum(['app', 'pages'])).max(2),
  }).strict(),
  capabilities: z.array(limitedString).max(100),
  assets: z.array(assetSchema).max(100_000),
  routes: z.array(routeSchema).max(20_000),
  diagnostics: z.array(z.string().max(4096)).max(1_000),
}).strict()

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
