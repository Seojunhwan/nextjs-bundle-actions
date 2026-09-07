# nextjs-bundle-actions

Private GitHub Actions that collect normalized Next.js client bundle snapshots,
compare a pull request head with its exact base commit, and maintain one PR
comment per project.

The caller owns dependency installation and `next build`. This project only
reads the completed `.next` output, uploads a compact `snapshot.json` Artifact,
and later reuses the base branch Artifact. It never uploads the full build.

## Why two Actions

Fork pull requests must not receive a token that can write comments. Collection
runs in the untrusted build workflow, while reporting runs later from a trusted
`workflow_run` workflow:

```text
user-managed Next build
        │
        ▼
collect Action ──► normalized snapshot Artifact
                            │
             exact base SHA│head SHA
                            ▼
report Action ──► compare + budgets ──► sticky PR comment
```

Use [the collect workflow](examples/bundle-collect.yml) and
[the report workflow](examples/bundle-report.yml) as a starting point. The
collect workflow deliberately checks out the PR head SHA; GitHub's default
`pull_request` SHA can represent a synthetic merge commit.

> This repository is private. Grant the consuming repositories access to the
> private Action, and replace `@v1` in the examples with a released immutable
> tag or commit.

## Collect inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `build-path` | `.next` | Completed Next.js output directory |
| `project-id` | `default` | Stable app identifier in a monorepo |
| `commit-sha` | PR head or `GITHUB_SHA` | Commit represented by this build |
| `retention-days` | repository policy | Optional Artifact retention override |
| `strict` | `false` | Fail instead of saving degraded asset-only evidence |

## Report inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `github-token` | required | Token with Actions read and PR write access |
| `project-id` | `default` | Must match collection |
| `config-path` | none | YAML/JSON config fetched from the exact base SHA |
| `top-n` | config or `20` | Changed routes shown in the comment |
| `max-gzip-bytes` | none | Per-route absolute gzip budget |
| `max-gzip-delta-bytes` | none | Per-route gzip increase budget |
| `max-gzip-delta-percentage` | none | Per-route percentage increase budget |

Explicit Action budget inputs override values from the config file. The config
is fetched through the GitHub API at the PR base SHA, so untrusted head changes
cannot relax the budget used by the trusted report workflow.

```yaml
version: 1
projects:
  web:
    topN: 20
    budgets:
      maxGzipBytes: 180000
      maxGzipDeltaBytes: 8192
      maxGzipDeltaPercentage: 5
```

## Comparison behavior

- Only a snapshot whose Artifact name, commit SHA, base branch, schema, project,
  and repository all match is accepted as the baseline.
- There is no ancestor fallback. If the exact base snapshot is absent, the
  report succeeds, leaves a warning comment, and keeps the head Artifact for
  later use.
- Added and removed routes are explicit. Budgets do not fail removed routes.
- A changed or unknown Next.js output format degrades to raw/gzip facts for all
  emitted client chunks. It records diagnostics and skips route comparison; it
  does not guess route associations. Set `strict: true` to fail instead.
- Comments show the 20 largest absolute gzip changes by default and link to the
  complete head snapshot.

`route.initialAssets.v1` is estimated initial client JavaScript: shared runtime,
route chunks, and polyfills referenced by the initial document. Raw bytes and
gzip level-9 bytes are measured per file. This is a stable comparison metric,
not a claim about browser transfer size, protocol compression, or runtime-loaded
chunks.

## Supported output strategies

Collection is capability- and manifest-driven rather than selected by a Next.js
version switch. It currently handles:

- Pages Router `build-manifest.json` route graphs;
- App Router Webpack route and client-reference manifests;
- Next.js route bundle diagnostics, including Turbopack's opaque chunk names;
- mixed App and Pages projects;
- asset-only graceful degradation for future or unknown formats.

The implementation was checked against real Next.js 16.2.3 Webpack and
Turbopack builds with static and dynamic App Router routes. Details are in
[the build-output research](docs/research/next-16.2.3-webpack.md).

## Development

```sh
pnpm install
pnpm test:run
pnpm typecheck
pnpm build
```

The checked-in `actions/*/dist` bundles are required by GitHub Actions. CI
rebuilds them and fails when generated output is stale. See
[architecture.md](docs/architecture.md) for contracts and dependency rules.
