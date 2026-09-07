import { describe, expect, it } from 'vitest'

import { runReport, type Reporter } from '../index.js'
import type { BundleSnapshot } from '../contracts/index.js'

function snapshot(commitSha: string): BundleSnapshot {
  return {
    schemaVersion: 1,
    metricDefinitionVersion: 1,
    identity: { repository: 'acme/storefront', projectId: 'web', commitSha },
    environment: { nextVersion: '16.2.3', bundler: 'webpack', routers: ['app'] },
    capabilities: ['route.initialAssets.v1'],
    assets: [],
    routes: [],
    diagnostics: [],
  }
}

class MemoryReporter implements Reporter {
  comments: Array<{ projectId: string; body: string }> = []

  async upsertComment(projectId: string, body: string): Promise<void> {
    this.comments.push({ projectId, body })
  }
}

describe('runReport', () => {
  it('reports a successful baseline-missing state without comparing', async () => {
    const reporter = new MemoryReporter()

    const outcome = await runReport({
      base: null,
      head: snapshot('head'),
      policy: {},
      artifactUrl: 'https://github.example/artifact/1',
      topN: 20,
    }, { reporter })

    expect(outcome.status).toBe('baseline-missing')
    expect(reporter.comments[0]?.body).toContain('Baseline snapshot unavailable')
    expect(reporter.comments[0]?.body).toContain('<!-- nextjs-bundle-actions:project=web -->')
  })

  it('compares, evaluates, and reports when the exact base exists', async () => {
    const reporter = new MemoryReporter()

    const outcome = await runReport({
      base: snapshot('base'),
      head: snapshot('head'),
      policy: {},
      artifactUrl: 'https://github.example/artifact/1',
      topN: 20,
    }, { reporter })

    expect(outcome.status).toBe('reported')
    expect(outcome.evaluation?.status).toBe('pass')
    expect(reporter.comments[0]?.body).toContain('Bundle budget passed')
  })
})
