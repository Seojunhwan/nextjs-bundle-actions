import type {
  BudgetPolicy,
  BudgetViolation,
  BundleDiff,
  Evaluation,
} from '../contracts/index.js'

export function evaluate(
  diff: BundleDiff,
  policy: BudgetPolicy,
): Evaluation {
  if (!diff.compatible) return { status: 'skipped', violations: [] }

  const violations: BudgetViolation[] = []
  for (const route of diff.routes) {
    if (route.status === 'removed') continue

    if (
      policy.maxGzipBytes !== undefined &&
      route.headGzipBytes !== null &&
      route.headGzipBytes > policy.maxGzipBytes
    ) {
      violations.push({
        path: route.path,
        rule: 'maxGzipBytes',
        actual: route.headGzipBytes,
        limit: policy.maxGzipBytes,
      })
    }
    if (
      policy.maxGzipDeltaBytes !== undefined &&
      route.gzipDeltaBytes > policy.maxGzipDeltaBytes
    ) {
      violations.push({
        path: route.path,
        rule: 'maxGzipDeltaBytes',
        actual: route.gzipDeltaBytes,
        limit: policy.maxGzipDeltaBytes,
      })
    }
    if (
      policy.maxGzipDeltaPercentage !== undefined &&
      route.gzipDeltaPercentage !== null &&
      route.gzipDeltaPercentage > policy.maxGzipDeltaPercentage
    ) {
      violations.push({
        path: route.path,
        rule: 'maxGzipDeltaPercentage',
        actual: route.gzipDeltaPercentage,
        limit: policy.maxGzipDeltaPercentage,
      })
    }
  }

  return {
    status: violations.length === 0 ? 'pass' : 'fail',
    violations,
  }
}
