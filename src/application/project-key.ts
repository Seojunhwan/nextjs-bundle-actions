import { createHash } from 'node:crypto'

export function projectKey(projectId: string): string {
  const readable = projectId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'project'

  if (projectId === readable) return readable
  const digest = createHash('sha256').update(projectId).digest('hex').slice(0, 8)
  return `${readable}-${digest}`
}
