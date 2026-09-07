import { describe, expect, it, vi } from 'vitest'

import { GitHubCommentReporter } from './reporter.js'

describe('GitHubCommentReporter', () => {
  it('updates the existing project comment instead of creating noise', async () => {
    const listComments = vi.fn(async () => ({ data: [
      { id: 7, body: '<!-- nextjs-bundle-actions:project=web -->\nold' },
    ] }))
    const updateComment = vi.fn(async () => ({ data: {} }))
    const createComment = vi.fn(async () => ({ data: {} }))
    const reporter = new GitHubCommentReporter(
      { listComments, updateComment, createComment },
      { owner: 'acme', repo: 'storefront', issueNumber: 12 },
    )

    await reporter.upsertComment(
      'web',
      '<!-- nextjs-bundle-actions:project=web -->\nnew',
    )

    expect(updateComment).toHaveBeenCalledWith({
      owner: 'acme', repo: 'storefront', comment_id: 7,
      body: '<!-- nextjs-bundle-actions:project=web -->\nnew',
    })
    expect(createComment).not.toHaveBeenCalled()
  })

  it('creates the project comment when no marker exists', async () => {
    const listComments = vi.fn(async () => ({ data: [] }))
    const updateComment = vi.fn(async () => ({ data: {} }))
    const createComment = vi.fn(async () => ({ data: {} }))
    const reporter = new GitHubCommentReporter(
      { listComments, updateComment, createComment },
      { owner: 'acme', repo: 'storefront', issueNumber: 12 },
    )

    await reporter.upsertComment(
      'web',
      '<!-- nextjs-bundle-actions:project=web -->\nnew',
    )

    expect(createComment).toHaveBeenCalledWith({
      owner: 'acme', repo: 'storefront', issue_number: 12,
      body: '<!-- nextjs-bundle-actions:project=web -->\nnew',
    })
    expect(updateComment).not.toHaveBeenCalled()
  })

  it('finds an existing marker beyond the first 100 comments', async () => {
    const listComments = vi.fn(async ({ page }: { page: number }) => ({
      data: page === 1
        ? Array.from({ length: 100 }, (_, index) => ({ id: index, body: 'other' }))
        : [{ id: 777, body: '<!-- nextjs-bundle-actions:project=web -->\nold' }],
    }))
    const updateComment = vi.fn(async () => ({ data: {} }))
    const createComment = vi.fn(async () => ({ data: {} }))
    const reporter = new GitHubCommentReporter(
      { listComments, updateComment, createComment },
      { owner: 'acme', repo: 'storefront', issueNumber: 12 },
    )

    await reporter.upsertComment(
      'web',
      '<!-- nextjs-bundle-actions:project=web -->\nnew',
    )

    expect(listComments).toHaveBeenCalledTimes(2)
    expect(updateComment).toHaveBeenCalledWith(expect.objectContaining({
      comment_id: 777,
    }))
    expect(createComment).not.toHaveBeenCalled()
  })
})
