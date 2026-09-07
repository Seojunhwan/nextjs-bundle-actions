import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

import type { AssetFact, CollectedBuild } from '../contracts/index.js'
import { readBuildEnvironment } from './environment.js'

async function javascriptFiles(directory: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return javascriptFiles(path)
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : []
  }))
  return files.flat()
}

export async function collectEmittedClientAssets(
  buildPath: string,
  cause: unknown,
): Promise<CollectedBuild> {
  const absoluteBuildPath = resolve(buildPath)
  const files = await javascriptFiles(resolve(absoluteBuildPath, 'static/chunks'))
  const assets: AssetFact[] = await Promise.all(files
    .map((path) => ({
      path,
      id: relative(absoluteBuildPath, path).split(sep).join('/'),
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(async ({ path, id }) => {
      const content = await readFile(path)
      return {
        id,
        rawBytes: content.byteLength,
        gzipBytes: gzipSync(content, { level: 9 }).byteLength,
      }
    }))

  const message = cause instanceof Error ? cause.message : String(cause)
  return {
    environment: await readBuildEnvironment(buildPath, []),
    capabilities: [
      'asset.rawBytes.v1',
      'asset.gzipBytes.v1',
      'build.emittedClientAssets.v1',
    ],
    assets,
    routes: [],
    diagnostics: [
      `collector degraded: ${message}. Route associations were not inferred.`,
    ],
  }
}
