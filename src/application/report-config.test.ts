import { describe, expect, it } from 'vitest'

import { parseReportConfig } from './report-config.js'

describe('parseReportConfig', () => {
  it('selects one project from YAML', () => {
    expect(parseReportConfig(`
version: 1
projects:
  web:
    topN: 12
    budgets:
      maxGzipBytes: 150000
      maxGzipDeltaBytes: 4096
`, 'web')).toEqual({
      topN: 12,
      policy: {
        maxGzipBytes: 150_000,
        maxGzipDeltaBytes: 4_096,
      },
    })
  })

  it('accepts JSON and defaults omitted project settings', () => {
    expect(parseReportConfig(
      JSON.stringify({ version: 1, projects: { web: {} } }),
      'web',
    )).toEqual({ topN: undefined, policy: {} })
  })

  it('rejects unknown keys and missing projects', () => {
    expect(() => parseReportConfig(
      'version: 1\nprojects:\n  web:\n    surprise: true\n',
      'web',
    )).toThrow()
    expect(() => parseReportConfig(
      'version: 1\nprojects:\n  docs: {}\n',
      'web',
    )).toThrow(/project "web"/)
  })
})
