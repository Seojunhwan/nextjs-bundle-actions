import { compare } from '../analysis/compare.js'
import { evaluate } from '../analysis/evaluate.js'
import type {
  BudgetPolicy,
  BundleSnapshot,
  Evaluation,
} from '../contracts/index.js'
import { renderComment } from './render-comment.js'
import { projectKey } from './project-key.js'

export interface Reporter {
  upsertComment(projectId: string, body: string): Promise<void>
}

export interface RunReportInput {
  base: BundleSnapshot | null
  head: BundleSnapshot
  policy: BudgetPolicy
  artifactUrl: string
  topN: number
}

export interface ReportOutcome {
  status: 'baseline-missing' | 'reported'
  evaluation?: Evaluation
}

function baselineMissingComment(
  head: BundleSnapshot,
  artifactUrl: string,
): string {
  const projectId = projectKey(head.identity.projectId)
  return [
    `<!-- nextjs-bundle-actions:project=${projectId} -->`,
    '## ⚠️ Baseline snapshot unavailable',
    '',
    `Stored the head snapshot for \`${head.identity.commitSha}\`. No bundle comparison was performed.`,
    '',
    `[Download snapshot JSON](${artifactUrl})`,
  ].join('\n')
}

export async function runReport(
  input: RunReportInput,
  ports: { reporter: Reporter },
): Promise<ReportOutcome> {
  if (!input.base) {
    await ports.reporter.upsertComment(
      input.head.identity.projectId,
      baselineMissingComment(input.head, input.artifactUrl),
    )
    return { status: 'baseline-missing' }
  }

  const diff = compare(input.base, input.head)
  const evaluation = evaluate(diff, input.policy)
  await ports.reporter.upsertComment(
    input.head.identity.projectId,
    renderComment({
      diff,
      evaluation,
      artifactUrl: input.artifactUrl,
      topN: input.topN,
    }),
  )

  return { status: 'reported', evaluation }
}
