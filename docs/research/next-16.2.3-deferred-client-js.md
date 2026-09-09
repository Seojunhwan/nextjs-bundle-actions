# Next.js 16.2.3 deferred client JavaScript research

## Question

Can a completed App Router build prove which client JavaScript is deferred by a
route-level dynamic import, without executing application code or inferring from
chunk names?

## Lab setup

The companion Lab added a `/dashboard` Client Component that uses
`next/dynamic(() => import("./deferred-chart"))`. The imported component contains
the sentinel `NEXT_BUNDLE_DEFERRED_CHART_SENTINEL_v1`. The same source was built
with Node.js 24.10.0 and Next.js 16.2.3 using:

- `next build --webpack`
- the default `next build` Turbopack path

Both generated `/dashboard` HTML files omitted the sentinel chunk, confirming
that it was not part of the route's initial script set.

## Webpack evidence

The global `.next/react-loadable-manifest.json` mapped:

```text
app/dashboard/deferred-chart-loader.tsx -> ./deferred-chart
  -> static/chunks/41.d1548a2908bf71fb.js
```

The `/dashboard/page` client-reference manifest independently listed
`app/dashboard/deferred-chart-loader.tsx` as a client module and associated that
module with the dashboard route entry chunk. Combining those two manifests
provides route evidence without assuming that a content-hashed filename belongs
to a route.

The deferred chunk contained the sentinel and measured 423 raw bytes and 331
gzip bytes with Node.js 24 `gzipSync(..., { level: 9 })`.

## Turbopack evidence

Turbopack emitted a route-scoped manifest at:

```text
.next/server/app/dashboard/page/react-loadable-manifest.json
```

It mapped the same dynamic import directly to
`static/chunks/17ho0lpvwqk6-.js`. The opaque chunk contained the sentinel and
measured 484 raw bytes and 371 gzip bytes with the same method.

## Contract decision

`route.deferredAssets.v1` is the deduplicated union of JavaScript files directly
linked by the route's loadable evidence, excluding `initialAssets`. Raw and gzip
sizes are measured from those files. The metric is observability-only and
does not affect budgets.

Webpack association requires both the global loadable mapping and route-local
client-module evidence. Turbopack association uses its route-scoped loadable
manifest. Missing or contradictory evidence is never replaced with a filename
guess.

Pages Router deferred association is not supported. Its v2 route fields are
`null`, with a diagnostic, so consumers can distinguish “unavailable” from a
measured empty set.
