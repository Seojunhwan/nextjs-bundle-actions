# AGENTS.md

## Project goal

`nextjs-bundle-actions` collects a versioned, normalized snapshot from a completed
Next.js build, compares an exact PR base/head pair, evaluates budgets, and delivers
the result through GitHub Actions. Callers own dependency installation and builds.

## Architecture rules

- Keep Next.js version, Webpack, and Turbopack output knowledge inside `collectors`.
- Keep `analysis` pure and dependent only on versioned contracts.
- Keep GitHub API, Artifact, and comment behavior inside `adapters` and `entrypoints`.
- Do not add format-specific branches to analysis or reporting.
- Treat `BundleSnapshot` as the stable cross-layer and external file contract.
- Bump `schemaVersion` for incompatible storage changes and
  `metricDefinitionVersion` for incompatible metric changes.
- Never infer route associations without evidence. Degrade with diagnostics when
  `strict` is false, and fail when `strict` is true.

The dependency direction is enforced by `test/architecture/layer-boundaries.test.ts`.

## Security and trust boundaries

- The collect workflow runs PR code and must not require write permissions.
- The report workflow runs from `workflow_run` with `actions: read`,
  `contents: read`, and `pull-requests: write`.
- Resolve the current PR and exact base/head SHAs from trusted GitHub metadata.
- Validate downloaded snapshots with the strict schema and size limit.
- Read optional budget configuration from the exact base SHA.
- Escape untrusted route text before rendering Markdown.
- Never upload the complete `.next` directory. Upload only normalized evidence.

## Development workflow

Use pnpm and Node.js 24. Implement behavior with TDD at public seams.

```sh
pnpm install
pnpm test:run
pnpm typecheck
pnpm build
git diff --exit-code -- actions/collect/dist actions/report/dist
```

- Add a failing test before changing behavior.
- Prefer minimized real-output fixtures for new Next.js formats.
- Run `pnpm test:lab` when collector behavior or supported build output changes.
- Do not edit `actions/*/dist` manually. Rebuild it with `pnpm build`.
- Keep workflow examples and README inputs/outputs synchronized with `action.yml`.
- Use Conventional Commits and do not include unrelated workspace changes.

## Public collect outputs

- `snapshot-path` is an absolute path valid for later steps in the same job.
- `artifact-name` is the portable handoff for `actions/download-artifact` in a
  later job.
- `artifact-id`, `artifact-url`, and `artifact-digest` support GitHub API and
  external integrations.
- The Artifact contains exactly one file named `snapshot.json`.

Changes to these names or semantics are public API changes and require tests and
README updates.

## End-to-end verification

The private companion repository is `Seojunhwan/nextjs-bundle-actions-e2e`.
Before claiming hosted support:

1. Pin the Action by immutable commit SHA.
2. Build `apps/web` through Turborepo with both `next build --webpack` and the
   default `next build` Turbopack path.
3. Verify same-job consumption through `snapshot-path`.
4. Verify next-job download through `artifact-name`.
5. Inspect both Artifact JSON files for the expected `environment.bundler`.
6. Confirm the trusted report workflow compares the exact base and head and
   updates one project-specific PR comment.
