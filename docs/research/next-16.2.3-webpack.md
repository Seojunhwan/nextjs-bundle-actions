# Next.js 16.2.3 Webpack and Turbopack build-output research

## Scope

- Generated outside this repository at `/Users/gamguma/nextjs-bundle-actions-lab`.
- Created with `create-next-app@16.2.3` and pnpm.
- Built with `next build --webpack`.
- App Router routes:
  - `/`
  - `/dashboard`
  - dynamic `/products/[id]`
- Client components include route-local modules and one module shared by two routes.

The lab keeps three outputs for inspection:

- `.next-webpack-minimal`
- `.next-webpack-client-routes`
- `.next` (client routes plus the dynamic route)

These directories are research material only. They are not copied into the product repository.

## Observed sources of truth

### Environment

- `.next/diagnostics/framework.json` contains `{ "name": "Next.js", "version": "16.2.3" }`.
- The `next-build` span in `.next/trace-build` contains `version: 16.2.3` and `bundler: webpack`.
- Cache-directory names are not suitable evidence because stale cache directories can survive across builds.

### Routes

- `.next/app-path-routes-manifest.json` maps internal App Router entries to public routes:

```json
{
  "/dashboard/page": "/dashboard",
  "/page": "/",
  "/products/[id]/page": "/products/[id]"
}
```

- `.next/routes-manifest.json` distinguishes static and dynamic public routes.
- Framework-owned `/_not-found` and `/_global-error` entries are also present and must be classified separately from user routes.

### Initial client assets

- `.next/build-manifest.json` does not map App Router routes. Its `pages` map only contains `/_app` in this build.
- `rootMainFiles` contains the shared App Router runtime chunks.
- `polyfillFiles` is separate and was present in the HTML for every inspected route.
- Static App routes expose their actual initial scripts in generated HTML.
- Dynamic routes do not have generated HTML, so the collector needs manifest-based inference.
- Each route has a server-side `page_client-reference-manifest.js`. It is a JavaScript assignment containing a JSON payload, not a plain JSON file. It must be parsed as data and never executed.
- A dynamic route client entry was represented as:

```text
static/chunks/app/products/%5Bid%5D/page-<hash>.js
```

  while the filesystem path used decoded brackets:

```text
static/chunks/app/products/[id]/page-<hash>.js
```

- `clientModules` can contain entries from unrelated routes. Unioning every `chunks` array produces false route associations.
- Summing every emitted file also produces false results. For example, a framework chunk was emitted but was not included in the initial script set.

## Independent runtime check

The dynamic production route was served with `next start` and requested as `/products/sku-1`. Its script list matched:

```text
build-manifest.rootMainFiles
+ build-manifest.polyfillFiles
+ the dynamic route entry chunk
```

The resulting dynamic-route total was:

```json
{
  "rawBytes": 537936,
  "gzipBytes": 164871
}
```

The two static routes shared five initial chunks and each had one route entry chunk. Their totals were:

| Route | Raw bytes | Gzip bytes |
| --- | ---: | ---: |
| `/` | 538138 | 164948 |
| `/dashboard` | 538148 | 164948 |

Gzip values use Node zlib level 9 on each asset independently.

## Collector consequences

1. Pages Router and App Router need separate route readers.
2. App Router route discovery starts from `app-path-routes-manifest.json`.
3. Environment detection should prefer diagnostic/trace evidence rather than directory names.
4. Root runtime and polyfill assets are separate inputs.
5. Static HTML is a useful test oracle, not a universal production input.
6. Dynamic route entry paths require safe URL decoding before filesystem resolution.
7. Client-reference payloads must be size-limited, envelope-validated, and parsed without evaluation.
8. A reader must expose evidence and capability identifiers; it must not silently guess when required inputs conflict.
9. Shared/route-specific classification remains analysis-core responsibility after the collector emits a route-to-asset graph.

## Next test seam

The next TDD slice should pass a minimized copy of the observed manifests and chunks through the public `collect()` seam and assert that App Router `/`, `/dashboard`, and `/products/[id]` resolve to the independently observed initial asset sets.

## Turbopack follow-up

The same lab was rebuilt with `next build --turbopack`. The route names and
environment sources remain available, but emitted chunk names are opaque and
cannot be associated with an App Router path from their filenames.

Next.js 16.2.3 emits `.next/diagnostics/route-bundle-stats.json` for this build.
Each entry provides a public route, `firstLoadChunkPaths`, and an independent
`firstLoadUncompressedJsBytes` total. The measured sum of those files matched
the reported raw total for every inspected route, so the collector treats a
mismatch as conflicting evidence instead of silently continuing.

The diagnostic intentionally omitted the build's polyfill chunk. Static HTML
showed that the polyfill was still loaded by each route:

| Route | Diagnostic raw bytes | HTML script raw bytes | Difference |
| --- | ---: | ---: | ---: |
| `/` | 514,139 | 626,733 | 112,594 |
| `/dashboard` | 514,149 | 626,743 | 112,594 |

The difference exactly matched `build-manifest.polyfillFiles`. To preserve one
metric across builders, `route.initialAssets.v1` means all initial JS script
assets, including shared runtime and polyfills. The Turbopack reader therefore
validates the diagnostic total first and then adds the manifest polyfills to
every route. Raw and gzip sizes are always measured from the files by this
project; upstream byte totals are validation evidence only.

`route-bundle-stats.json` is preferred when present because it avoids depending
on builder-specific filename conventions and can represent App, Pages, or mixed
route output. If no supported route graph can be read, non-strict collection
stores emitted client asset facts with diagnostics but does not invent route
associations. Strict collection surfaces the original incompatibility.

## Pages Router follow-up

A separate Pages Router application was scaffolded at
`/Users/gamguma/nextjs-bundle-actions-pages-lab` and built with both builders.
For Webpack, `build-manifest.pages["/"]` contained the route runtime and entry,
but omitted three initial-script groups visible in the generated HTML:

- `build-manifest.polyfillFiles`;
- the route-independent files in `build-manifest.pages["/_app"]`;
- JavaScript entries in `build-manifest.lowPriorityFiles`.

The normalized `/` total was 455,976 raw bytes after those sets were combined
and deduplicated. With Turbopack, `route-bundle-stats.json` already included the
route and `/_app` chunks and reported 380,563 raw bytes. It omitted the three
Pages document-manifest scripts in `lowPriorityFiles`; adding their 526 bytes
produced the HTML-observed total of 381,089 bytes.

Consequently, the Pages Webpack reader combines all four manifest inputs. The
route-diagnostics reader validates its own raw total before adding polyfills to
all routes and low-priority files only to routes owned by the Pages Router. App
routes do not receive Pages document-manifest files.

Finally, adding `/app-home` to the Pages lab produced a mixed-router output.
Strict collection passed for both Webpack and Turbopack and reported the two
public routes with `environment.routers` set to `["app", "pages"]`.
