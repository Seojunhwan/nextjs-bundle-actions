import type { BundleDiff, Evaluation } from '../contracts/index.js'
import { projectKey } from './project-key.js'

export interface RenderCommentInput {
  diff: BundleDiff
  evaluation: Evaluation
  artifactUrl: string
  topN: number
}

function bytes(value: number | null): string {
  if (value === null) return '—'
  const absolute = Math.abs(value)
  if (absolute < 1024) return `${value} B`
  return `${(value / 1024).toFixed(1)} KiB`
}

function signedBytes(value: number): string {
  return `${value > 0 ? '+' : ''}${bytes(value)}`
}

function percentage(value: number | null): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('`', '\\`')
}

export function renderComment({
  diff,
  evaluation,
  artifactUrl,
  topN,
}: RenderCommentInput): string {
  const projectId = projectKey(diff.head.projectId)
  const heading =
    evaluation.status === 'fail'
      ? '❌ Bundle budget failed'
      : evaluation.status === 'skipped'
        ? '⚠️ Bundle comparison skipped'
        : '✅ Bundle budget passed'
  const routes = diff.routes
    .filter((route) => route.status !== 'unchanged')
    .sort(
      (left, right) =>
        Math.abs(right.gzipDeltaBytes) - Math.abs(left.gzipDeltaBytes) ||
        left.path.localeCompare(right.path),
    )
    .slice(0, Math.max(0, topN))
  const routeRows = routes.map(
    (route) =>
      `| \`${escapeCell(route.path)}\` | ${route.status} | ${bytes(route.headGzipBytes)} | ${signedBytes(route.gzipDeltaBytes)} | ${percentage(route.gzipDeltaPercentage)} |`,
  )
  const violationLines = evaluation.violations.map(
    (violation) =>
      `- \`${escapeCell(violation.path)}\`: ${violation.rule} ${violation.actual} > ${violation.limit}`,
  )

  return [
    `<!-- nextjs-bundle-actions:project=${projectId} -->`,
    `## ${heading}`,
    '',
    `\`${diff.base.commitSha}\` → \`${diff.head.commitSha}\``,
    ...(diff.diagnostics.length > 0
      ? ['', `Reason: ${diff.diagnostics.join('; ')}`]
      : []),
    '',
    '| Route | Status | Head gzip | Δ gzip | Δ |',
    '| --- | --- | ---: | ---: | ---: |',
    ...(routeRows.length > 0 ? routeRows : ['| — | unchanged | — | — | — |']),
    ...(violationLines.length > 0
      ? ['', '### Budget violations', '', ...violationLines]
      : []),
    '',
    `[Download head snapshot JSON](${artifactUrl})`,
  ].join('\n')
}
