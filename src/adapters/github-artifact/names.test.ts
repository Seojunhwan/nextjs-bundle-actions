import { describe, expect, it } from 'vitest'

import { snapshotArtifactName } from '../../index.js'

describe('snapshotArtifactName', () => {
  it('is deterministic and safe for matrix project identifiers', () => {
    const name = snapshotArtifactName('apps/store front', 'ABC123')
    expect(name).toMatch(
      /^next-bundle-snapshot--apps-store-front-[a-f0-9]{8}--abc123--v1$/,
    )
    expect(name).not.toBe(snapshotArtifactName('apps-store-front', 'ABC123'))
  })
})
