# Architecture

The stable boundary is the normalized snapshot, not any particular Next.js
manifest. Version- and builder-specific knowledge stays in collection adapters.

| Layer | Responsibility | May depend on |
| --- | --- | --- |
| `contracts` | Versioned DTOs, capabilities, validation | itself |
| `collectors` | Read untrusted `.next` evidence and normalize it | contracts |
| `analysis` | Measure routes, compare snapshots, evaluate budgets | contracts |
| `application` | Orchestrate collection and reporting use cases | core layers |
| `adapters` | GitHub Artifact and comment ports | application, contracts |
| `entrypoints` | Parse Action inputs and bind GitHub adapters | all public layers |

An architecture test checks these dependency directions.

## Contracts

`CollectedBuild` contains environment evidence, capabilities, measured assets,
route-to-initial-asset associations, and diagnostics. It deliberately excludes
GitHub concepts.

`BundleSnapshot` adds identity and pure analysis results. Its top-level
`schemaVersion` controls storage compatibility. `metricDefinitionVersion`
controls comparison compatibility. Capability identifiers allow partial results
without pretending that missing route evidence is available.

`BundleDiff` and `Evaluation` never read files or call GitHub. That makes the
same analysis reusable by future dashboard or API delivery adapters without
changing collection.

## Trust boundaries

The collect workflow executes PR code and its Artifact is untrusted. Reporting
therefore:

1. runs only for a successful `pull_request` source workflow;
2. resolves the current PR through trusted GitHub metadata;
3. requires an Artifact named for the current head SHA in that exact run;
4. limits snapshot size and validates every field with a strict schema;
5. verifies repository, project, and commit identity;
6. fetches optional policy configuration from the exact base SHA;
7. escapes route strings before rendering Markdown.

The exact base Artifact is selected by name, workflow SHA, branch, expiration,
and newest creation time. A missing baseline is data absence, not a build
failure.

## Adding a Next.js format

Add or update a collector using a minimized real-output fixture. The collector
must validate independent evidence where available, measure files itself, emit
only capabilities it can prove, and return the same `CollectedBuild` contract.
Analysis and delivery code should not need a format-specific branch.
