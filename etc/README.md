# etc — source-controlled deployment configuration

Entry point: `sdkwork.deployment.config.json` (deployment profile index;
`topology` points at `../specs/topology.spec.json`).

Layout (SOURCE_CONFIG_SPEC.md):

- `topology/base.env` — base layer shared by every profile.
- `topology/{standalone,cloud}.{development,test,staging,production,demo}.env` —
  materialized per-profile runtime configuration.
- `topology/environments/<environment>.base.env` — environment base layers.
- `topology/overrides/<profile-id>.env` — explicit profile overrides.

Regenerate the resolved env with `tools/materialize-topology-env.mjs`
(via `../sdkwork-specs`); do not hand-edit materialized outputs.
