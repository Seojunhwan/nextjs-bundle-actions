import { parse } from 'yaml'
import { z } from 'zod'

import type { BudgetPolicy } from '../contracts/index.js'

const nonNegative = z.number().finite().nonnegative()
const projectSchema = z.object({
  topN: z.number().int().positive().optional(),
  budgets: z.object({
    maxGzipBytes: nonNegative.optional(),
    maxGzipDeltaBytes: nonNegative.optional(),
    maxGzipDeltaPercentage: nonNegative.optional(),
  }).strict().optional(),
}).strict()

const configSchema = z.object({
  version: z.literal(1),
  projects: z.record(z.string().min(1).max(200), projectSchema),
}).strict()

export interface ProjectReportConfig {
  topN: number | undefined
  policy: BudgetPolicy
}

export function parseReportConfig(
  source: string,
  projectId: string,
  maxBytes = 1024 * 1024,
): ProjectReportConfig {
  if (Buffer.byteLength(source) > maxBytes) {
    throw new Error(`Report config exceeds ${maxBytes} bytes`)
  }
  const config = configSchema.parse(parse(source))
  const project = config.projects[projectId]
  if (!project) {
    throw new Error(`Report config does not define project "${projectId}"`)
  }
  const budgets = project.budgets
  return {
    topN: project.topN,
    policy: {
      ...(budgets?.maxGzipBytes === undefined
        ? {}
        : { maxGzipBytes: budgets.maxGzipBytes }),
      ...(budgets?.maxGzipDeltaBytes === undefined
        ? {}
        : { maxGzipDeltaBytes: budgets.maxGzipDeltaBytes }),
      ...(budgets?.maxGzipDeltaPercentage === undefined
        ? {}
        : { maxGzipDeltaPercentage: budgets.maxGzipDeltaPercentage }),
    },
  }
}
