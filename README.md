# nextjs-bundle-actions

Next.js 빌드 산출물에서 클라이언트 번들 크기를 수집하고, pull request의
정확한 base commit과 비교해 GitHub 코멘트로 알려주는 GitHub Actions입니다.

애플리케이션 설치와 빌드는 사용자가 담당합니다. 이 액션은 완료된 `.next`
디렉터리만 읽고, 전체 빌드 산출물 대신 정규화된 `snapshot.json`만
Artifact로 저장합니다.

## 주요 특징

- Next.js 버전이나 bundler 이름으로 분기하지 않고 실제 산출물의 manifest와
  capability를 확인합니다.
- App Router, Pages Router, 혼합 구성과 Webpack, Turbopack을 처리합니다.
- PR head와 정확한 base SHA를 비교합니다.
- base snapshot이 없으면 실패하지 않고 head snapshot을 저장합니다.
- 프로젝트별 gzip 절대 크기와 증가량 budget을 검사합니다.
- 동일 프로젝트의 PR 코멘트를 새로 쌓지 않고 갱신합니다.
- 수집 결과 파일과 Artifact 정보를 outputs로 제공해 사용자 step이나 job에서
  바로 재사용할 수 있습니다.

## 전체 흐름

```text
사용자 install + Next.js build
              │
              ▼
        collect Action
        ├─ snapshot-path ─────► 같은 job의 사용자 step
        └─ snapshot Artifact ─► 다음 job / 외부 분석 / dashboard
                    │
          base SHA  │  head SHA
                    ▼
          trusted report Action
                    │
                    ├─ 비교 및 budget 평가
                    └─ PR sticky comment
```

수집과 리포트를 분리한 이유는 fork PR에서 코멘트 쓰기 권한을 빌드 코드에
노출하지 않기 위해서입니다. PR 코드를 실행하는 collect workflow는 읽기
권한만 사용하고, trusted `workflow_run`에서 report Action을 실행합니다.

## 빠른 시작

### 1. 저장소 접근 허용

이 저장소가 private인 동안에는 Action 저장소의 **Settings → Actions →
General → Access**에서 사용하는 private 저장소에 접근을 허용해야 합니다.

아래 예시의 `@v1`은 배포한 immutable tag 또는 commit SHA로 교체하는 것을
권장합니다.

### 2. 빌드 후 snapshot 수집

사용하는 저장소에 `.github/workflows/bundle-collect.yml`을 만듭니다.

```yaml
name: Next.js Bundle Snapshot

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          # snapshot identity와 실제 checkout commit을 일치시킵니다.
          ref: ${{ github.event.pull_request.head.sha || github.sha }}

      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm build

      - id: bundle
        uses: Seojunhwan/nextjs-bundle-actions/actions/collect@v1
        with:
          build-path: .next
          project-id: web
```

`next build`, `next build --webpack`, Turborepo를 통한 build 모두 사용할 수
있습니다. 중요한 조건은 `build-path`가 완료된 Next.js 출력 디렉터리를
가리키는 것입니다.

### 3. PR 리포트 추가

`.github/workflows/bundle-report.yml`을 만듭니다.

```yaml
name: Next.js Bundle Report

on:
  workflow_run:
    workflows: [Next.js Bundle Snapshot]
    types: [completed]

permissions:
  actions: read
  contents: read
  pull-requests: write

jobs:
  report:
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    runs-on: ubuntu-latest
    steps:
      - uses: Seojunhwan/nextjs-bundle-actions/actions/report@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          project-id: web
          config-path: .github/nextjs-bundle-actions.yml
```

`workflows` 값은 collect workflow의 `name`과 정확히 같아야 합니다.

### 4. Budget 설정

`.github/nextjs-bundle-actions.yml`을 만듭니다.

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

설정은 PR head가 아니라 정확한 base SHA에서 읽습니다. PR 코드가 자신의
budget을 완화할 수 없도록 하기 위한 경계입니다.

### 5. 동작 확인

먼저 기본 브랜치에서 collect workflow를 한 번 실행해 base snapshot을
만듭니다. 이후 PR을 열면 다음 결과를 확인할 수 있습니다.

- collect run에 `next-bundle-snapshot--...` Artifact가 생성됩니다.
- report run이 성공합니다.
- PR에 route별 gzip 크기와 base 대비 변화량 코멘트가 생성됩니다.

base snapshot이 아직 없으면 report는 성공 상태로 끝나고 비교를 생략했다는
코멘트를 남깁니다. 해당 head snapshot은 이후 비교의 base로 재사용할 수
있습니다.

## 수집 결과 직접 사용하기

report Action을 사용하지 않아도 표준 `snapshot.json`을 사용자 코드에서
읽을 수 있습니다. dashboard 전송, 사내 budget 검사, 별도 리포트 생성 같은
확장에 적합합니다.

### 같은 job의 다음 step

`snapshot-path`는 현재 runner에 남아 있는 파일의 절대 경로입니다.

```yaml
- id: bundle
  uses: Seojunhwan/nextjs-bundle-actions/actions/collect@v1
  with:
    build-path: apps/web/.next
    project-id: web

- name: 사용자 분석 실행
  env:
    SNAPSHOT_PATH: ${{ steps.bundle.outputs.snapshot-path }}
  run: |
    jq '.environment, .routes[] | {path, gzipBytes}' "$SNAPSHOT_PATH"
```

`snapshot-path`는 같은 job에서만 유효합니다. job이 바뀌면 runner도 바뀔 수
있으므로 Artifact를 다운로드해야 합니다.

### 다음 job에서 사용

step output을 job output으로 전달한 뒤 `actions/download-artifact`의
`name`에 사용합니다.

```yaml
jobs:
  collect:
    runs-on: ubuntu-latest
    outputs:
      bundle-artifact-name: ${{ steps.bundle.outputs.artifact-name }}
    steps:
      - uses: actions/checkout@v7
      # install과 build step은 생략
      - id: bundle
        uses: Seojunhwan/nextjs-bundle-actions/actions/collect@v1
        with:
          build-path: apps/web/.next
          project-id: web

  consume:
    needs: collect
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v8
        with:
          name: ${{ needs.collect.outputs.bundle-artifact-name }}
          path: bundle-snapshot

      - run: jq '.routes' bundle-snapshot/snapshot.json
```

다른 workflow나 외부 시스템에서는 `artifact-id`, `artifact-url`,
`artifact-digest`를 GitHub API 또는 다운로드 링크와 함께 사용할 수 있습니다.

## Turborepo와 여러 Next.js 앱

각 앱에 고유한 `project-id`를 주고 build 출력 경로를 지정합니다.

```yaml
- run: pnpm turbo run build --filter=storefront
- id: storefront-bundle
  uses: Seojunhwan/nextjs-bundle-actions/actions/collect@v1
  with:
    build-path: apps/storefront/.next
    project-id: storefront
```

matrix를 사용할 때도 `project-id`와 `build-path`를 앱마다 안정적으로
유지해야 합니다. report Action의 `project-id`도 collect와 같아야 합니다.

## Collect Action reference

### Inputs

| Input | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `build-path` | 아니요 | `.next` | 완료된 Next.js 출력 디렉터리 |
| `project-id` | 아니요 | `default` | 저장소 안에서 앱을 구분하는 안정적인 ID |
| `commit-sha` | 아니요 | PR head 또는 `GITHUB_SHA` | 이 build가 나타내는 commit |
| `retention-days` | 아니요 | 저장소 정책 | Artifact 보존 일수 |
| `strict` | 아니요 | `false` | 알 수 없는 형식에서 asset-only로 완화하지 않고 실패할지 여부 |

### Outputs

| Output | 설명 |
| --- | --- |
| `snapshot-path` | 현재 job에서 읽을 수 있는 `snapshot.json` 절대 경로 |
| `artifact-name` | `actions/download-artifact`에 전달할 Artifact 이름 |
| `artifact-id` | GitHub가 발급한 Artifact ID |
| `artifact-url` | Artifact 다운로드 화면 URL |
| `artifact-digest` | GitHub Artifact 저장소가 반환한 SHA-256 digest |
| `capabilities` | 수집된 metric capability의 JSON 배열 |

Artifact에는 `snapshot.json` 하나만 들어갑니다. 전체 `.next` 디렉터리는
업로드하지 않습니다.

## Report Action reference

### Inputs

| Input | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `github-token` | 예 | 없음 | Actions 읽기와 PR 쓰기 권한이 있는 token |
| `project-id` | 아니요 | `default` | collect와 동일한 프로젝트 ID |
| `config-path` | 아니요 | 없음 | 정확한 base SHA에서 읽을 YAML 또는 JSON 설정 |
| `top-n` | 아니요 | 설정 또는 `20` | 코멘트에 표시할 변경 route 수 |
| `max-gzip-bytes` | 아니요 | 없음 | route별 gzip 절대 크기 제한 |
| `max-gzip-delta-bytes` | 아니요 | 없음 | route별 gzip 증가 byte 제한 |
| `max-gzip-delta-percentage` | 아니요 | 없음 | route별 gzip 증가율 제한 |

명시한 Action input은 설정 파일의 값을 덮어씁니다.

### Outputs

| Output | 설명 |
| --- | --- |
| `status` | `reported` 또는 `baseline-missing` |
| `violations` | bundle budget 위반의 JSON 배열 |

## `snapshot.json` 계약

```json
{
  "schemaVersion": 1,
  "metricDefinitionVersion": 1,
  "identity": {
    "repository": "acme/storefront",
    "projectId": "web",
    "commitSha": "abc123"
  },
  "environment": {
    "nextVersion": "16.2.3",
    "bundler": "turbopack",
    "routers": ["app"]
  },
  "capabilities": [
    "asset.rawBytes.v1",
    "asset.gzipBytes.v1",
    "route.initialAssets.v1"
  ],
  "assets": [],
  "routes": [],
  "diagnostics": []
}
```

- `schemaVersion`은 저장 형식 호환성을 나타냅니다.
- `metricDefinitionVersion`은 base와 head를 같은 기준으로 비교할 수 있는지
  나타냅니다.
- `capabilities`는 결과에 실제로 포함된 측정 능력입니다.
- `routes[].rawBytes`와 `routes[].gzipBytes`는 initial client JavaScript의
  추정치입니다.
- `diagnostics`는 완화 처리나 보정 내용을 기록합니다.

외부 소비자는 모르는 필드를 무시하고, 사용하는 capability가 존재하는지
확인해야 합니다. `route.initialAssets.v1`이 없으면 route 비교가 불가능한
asset-only 결과일 수 있습니다. 입력 schema는 최대 5 MiB로 제한됩니다.

## 비교 동작

- Artifact 이름, commit SHA, base branch, schema, project, repository가 모두
  맞는 snapshot만 baseline으로 사용합니다.
- 임의의 과거 ancestor로 fallback하지 않습니다.
- 추가·삭제된 route를 구분하며 삭제된 route에는 budget을 적용하지 않습니다.
- 기본적으로 gzip 절대 변화가 큰 route 20개를 표시합니다.
- 알 수 없는 Next.js 형식은 client chunk의 raw/gzip 정보만 저장하고 route
  연결을 추측하지 않습니다. `strict: true`면 대신 실패합니다.

`route.initialAssets.v1`은 초기 문서가 참조하는 shared runtime, route chunk,
polyfill을 합산합니다. gzip은 파일별 level 9 결과입니다. HTTP 전송 크기나
runtime에서 늦게 불러오는 chunk 전체를 의미하지는 않습니다.

## 지원하는 산출물

현재 다음 증거를 capability 기반으로 처리합니다.

- Pages Router `build-manifest.json`
- App Router Webpack route 및 client-reference manifest
- Turbopack의 opaque chunk 이름을 포함한 Next.js route bundle diagnostics
- App Router와 Pages Router 혼합 프로젝트
- 미래 또는 알 수 없는 형식의 asset-only graceful degradation

실제 Next.js 16.2.3의 Webpack과 Turbopack build로 검증했습니다. 조사 내용은
[Next.js build output research](docs/research/next-16.2.3-webpack.md)에 있습니다.

## 문제 해결

### base snapshot이 없다는 코멘트가 표시됨

PR의 정확한 base SHA에 해당하는 기본 브랜치 collect run이 아직 없습니다.
기본 브랜치 workflow를 실행한 후 PR head workflow를 다시 실행합니다.

### report workflow가 PR을 찾지 못함

collect workflow에서 PR head SHA를 checkout했는지 확인합니다. 예제처럼
`github.event.pull_request.head.sha || github.sha`를 사용합니다.

### private Action을 불러오지 못함

Action 저장소의 Actions access 설정에서 소비 저장소가 허용됐는지 확인합니다.
조직 정책이 private Action 사용을 제한하는지도 확인합니다.

### 다음 job에서 `snapshot-path`를 읽을 수 없음

경로는 현재 runner 전용입니다. `artifact-name`을 job output으로 넘기고
`actions/download-artifact`로 `snapshot.json`을 내려받습니다.

### Next.js 업데이트 후 strict 수집이 실패함

우선 `strict: false`로 diagnostics와 asset-only snapshot을 확보합니다. 새
산출물 형식은 collector layer에만 추가하고 snapshot 계약과 분석 layer는
유지합니다.

## 개발

```sh
pnpm install
pnpm test:run
pnpm typecheck
pnpm build
```

`actions/*/dist`는 GitHub Actions가 직접 실행하므로 source 변경 후 반드시
다시 빌드하고 커밋해야 합니다. CI는 dist를 재생성한 뒤 차이가 남으면
실패합니다.

레이어와 신뢰 경계는 [architecture.md](docs/architecture.md), 실제 산출물
조사 방법은 [Next.js build output research](docs/research/next-16.2.3-webpack.md)를
참고하세요.
