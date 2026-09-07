import { readdir, readFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../../src', import.meta.url))

const allowedDependencies: Record<string, Set<string>> = {
  contracts: new Set(['contracts']),
  analysis: new Set(['analysis', 'contracts']),
  collectors: new Set(['collectors', 'contracts']),
  application: new Set(['application', 'analysis', 'collectors', 'contracts']),
  adapters: new Set(['adapters', 'application', 'contracts']),
  entrypoints: new Set([
    'entrypoints',
    'adapters',
    'application',
    'contracts',
  ]),
}

async function typescriptFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return typescriptFiles(path)
    return entry.isFile() && entry.name.endsWith('.ts') ? [path] : []
  }))).flat()
}

describe('layer boundaries', () => {
  it('keeps dependency direction explicit', async () => {
    const violations: string[] = []
    for (const sourceLayer of Object.keys(allowedDependencies)) {
      for (const file of (await typescriptFiles(`${sourceRoot}/${sourceLayer}`))
        .filter((path) => !path.endsWith('.test.ts'))) {
        const source = await readFile(file, 'utf8')
        for (const match of source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
          const importPath = match[1]
          if (!importPath) continue
          const targetLayer = relative(
            sourceRoot,
            resolve(dirname(file), importPath),
          ).split('/')[0]
          if (targetLayer && !allowedDependencies[sourceLayer]?.has(targetLayer)) {
            violations.push(`${sourceLayer} -> ${targetLayer}: ${file}`)
          }
        }
      }
    }
    expect(violations).toEqual([])
  })
})
