# Repository Guidelines

<!-- SDKWORK-AGENTS-GENERATED: v2 -->

## SDKWORK Soul

Read `../sdkwork-specs/SOUL.md` before executing tasks in this root. Follow specs before memory, dictionary before context, stop on ambiguity, and evidence before completion.

## SDKWORK Standards

Canonical SDKWORK specs path from this root:

- `../sdkwork-specs/README.md`
- `../sdkwork-specs/SOUL.md`
- `../sdkwork-specs/AGENTS_SPEC.md`
- `../sdkwork-specs/PNPM_SCRIPT_SPEC.md`
- `../sdkwork-specs/GITHUB_WORKFLOW_SPEC.md`
- `../sdkwork-specs/CODE_STYLE_SPEC.md`
- `../sdkwork-specs/NAMING_SPEC.md`
- `../sdkwork-specs/WEB_FRAMEWORK_SPEC.md`
- `../sdkwork-specs/DATABASE_FRAMEWORK_SPEC.md`

Do not copy root standard text into this repository. If these relative paths do not resolve, stop and report the broken workspace layout.

## Application Identity

Read `agent.app.config.json` when the task touches Plugins application behavior, runtime config, SDK wiring, release metadata, app-owned capabilities, packaging, or deployment. Plugins persistence uses `ai_plugin_*` tables; file uploads must route through `sdkwork-drive`.

## Local Dictionary Structure

- `AGENTS.md`: repository agent entrypoint and relative SDKWork spec index.
- `CLAUDE.md`, `GEMINI.md`, `CODEX.md`: compatibility shims that point to `AGENTS.md` and must not duplicate rules.
- `agent.app.config.json`: Plugins application identity, runtime, release, and capability metadata.
- `.sdkwork/`: repository/application AI workspace metadata, local skills, local plugins, and manifests.
- `specs/`: local application/component contracts and narrowing rules.
- `apis/`, `sdks/`, `crates/`, `database/`: backend contracts and runtime.
- `apps/sdkwork-plugins-pc/`: PC React Admin client.
- `etc/`: source-controlled deployment index, topology profiles, and gateway templates.
- `docs/`, `scripts/`, `bin/`, `tools/`: documentation, thin command entrypoints, validators, and verification assets.

## Documentation Canon

- [docs/README.md](docs/README.md)

## Spec Resolution Order

Use dynamic progressive loading:

1. Read this `AGENTS.md` and any nearer component-level `AGENTS.md`.
2. Read `agent.app.config.json` only when app identity, runtime config, SDK wiring, release, packaging, or owned capabilities are touched.
3. Read local `specs/README.md` and `specs/component.spec.json` only when local contracts are relevant.
4. Read `../sdkwork-specs/README.md`, then only the task-specific root specs.
5. Inspect implementation files after the dictionary and relevant specs are clear.

## Required Specs By Task Type

- Any code change: `../sdkwork-specs/CODE_STYLE_SPEC.md`, `../sdkwork-specs/NAMING_SPEC.md`, plus only the touched language/framework spec.
- Rust code: `../sdkwork-specs/RUST_CODE_SPEC.md`; add `../sdkwork-specs/RUST_RPC_SPEC.md` when RPC is touched.
- TypeScript/Node code: `../sdkwork-specs/TYPESCRIPT_CODE_SPEC.md`.
- Frontend/UI code: `../sdkwork-specs/FRONTEND_CODE_SPEC.md`, `../sdkwork-specs/FRONTEND_SPEC.md`.
- API/SDK changes: `../sdkwork-specs/API_SPEC.md`, `../sdkwork-specs/SDK_SPEC.md`, `../sdkwork-specs/SDK_WORKSPACE_GENERATION_SPEC.md`, and `../sdkwork-specs/TEST_SPEC.md`.
- Security/auth changes: `../sdkwork-specs/IAM_SPEC.md`, `../sdkwork-specs/SECURITY_SPEC.md`.

## HTTP API Response Envelope

All SDKWork-owned custom HTTP contracts follow `../sdkwork-specs/API_SPEC.md` sections 4.5, 14, and 15:

- Success output: `SdkWorkApiResponse` with `{ "code": 0, "data": <payload>, "traceId": "<server-uuid>" }`.
- Error output: HTTP 4xx/5xx `application/problem+json` with numeric `code` and `traceId`.
- Single resource: `data.item`; lists: `data.items` + `data.pageInfo`; commands: `data.accepted`.
- Create uses `201`, delete uses `204` with no JSON body.

## Rust Naming And Dependency Declaration

Authority: `../sdkwork-specs/NAMING_SPEC.md` sections 3.1 and 3.2.

- Package plane (Cargo, filesystem, lock file) uses kebab-case; crate plane (lib target, modules, imports) uses snake_case.
- Every external crate referenced by `src/` MUST be declared in that crate's `[dependencies]`.
- Regenerate and commit `Cargo.lock` in the same change as any dependency table edit.

## Main-Branch Development

Development happens on `main`. Everything authored in this repository is committed onto `main`.

## Agent Execution Rules

Use dynamic progressive loading and the convention dictionary instead of broad context loading. Record exact verification commands and important outputs before reporting completion.
