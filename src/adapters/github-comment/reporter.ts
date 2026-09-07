import type { Reporter } from '../../application/run-report.js'
import { projectKey } from '../../application/project-key.js'

interface CommentClient {
  listComments(input: {
    owner: string
    repo: string
    issue_number: number
    per_page: number
    page: number
  }): Promise<{ data: Array<{ id: number; body?: string | null }> }>
  updateComment(input: {
    owner: string
    repo: string
    comment_id: number
    body: string
  }): Promise<unknown>
  createComment(input: {
    owner: string
    repo: string
    issue_number: number
    body: string
  }): Promise<unknown>
}

export interface GitHubCommentContext {
  owner: string
  repo: string
  issueNumber: number
}

export class GitHubCommentReporter implements Reporter {
  constructor(
    private readonly client: CommentClient,
    private readonly context: GitHubCommentContext,
  ) {}

  async upsertComment(projectId: string, body: string): Promise<void> {
    const marker = `<!-- nextjs-bundle-actions:project=${projectKey(projectId)} -->`
    let existing: { id: number; body?: string | null } | undefined
    let page = 1
    do {
      const comments = await this.client.listComments({
        owner: this.context.owner,
        repo: this.context.repo,
        issue_number: this.context.issueNumber,
        per_page: 100,
        page,
      })
      existing = comments.data.find((comment) => comment.body?.includes(marker))
      if (existing || comments.data.length < 100) break
      page += 1
    } while (page <= 100)

    if (existing) {
      await this.client.updateComment({
        owner: this.context.owner,
        repo: this.context.repo,
        comment_id: existing.id,
        body,
      })
      return
    }

    await this.client.createComment({
      owner: this.context.owner,
      repo: this.context.repo,
      issue_number: this.context.issueNumber,
      body,
    })
  }
}
