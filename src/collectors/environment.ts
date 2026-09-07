import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { CollectedBuild } from '../contracts/index.js'

type BuildEnvironment = CollectedBuild['environment']

async function optionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function readBuildEnvironment(
  buildPath: string,
  routers: BuildEnvironment['routers'],
): Promise<BuildEnvironment> {
  const [frameworkSource, traceSource] = await Promise.all([
    optionalFile(resolve(buildPath, 'diagnostics/framework.json')),
    optionalFile(resolve(buildPath, 'trace-build')),
  ])
  let nextVersion: string | null = null
  if (frameworkSource) {
    const framework = JSON.parse(frameworkSource) as { version?: unknown }
    if (typeof framework.version === 'string') nextVersion = framework.version
  }

  let bundler: BuildEnvironment['bundler'] = 'unknown'
  if (traceSource) {
    for (const line of traceSource.split('\n').filter(Boolean)) {
      const spans = JSON.parse(line) as Array<{
        name?: unknown
        tags?: { bundler?: unknown; version?: unknown }
      }>
      const build = spans.find((span) => span.name === 'next-build')
      if (build?.tags?.bundler === 'webpack' || build?.tags?.bundler === 'turbopack') {
        bundler = build.tags.bundler
      }
      if (!nextVersion && typeof build?.tags?.version === 'string') {
        nextVersion = build.tags.version
      }
    }
  }

  return { nextVersion, bundler, routers }
}
