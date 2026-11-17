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

## Client env materialization

`client-env.materialization.json` declares the `apps/sdkwork-plugins-pc` surface
as the repository's public-token carrier. It mints the deploy-anchored
application access token per profile into
`apps/sdkwork-plugins-pc/.env.<deployment-profile>.<environment>`.

The token's `app_id`/`aud` comes from `SDKWORK_DEPLOY_APPLICATION_ID`, never from
a compiled-in literal (`APP_ACCESS_TOKEN_SPEC.md` §3.1.1): the deploy anchor is
owned by the installation, and the registrar writes it into the authored
topology override layer before re-running the materializer. Materialize or
verify the committed profiles with:

```sh
SDKWORK_DEPLOY_APPLICATION_ID=__SDKWORK_DEPLOY_APPLICATION_ID__ \
  node ../sdkwork-specs/tools/materialize-client-env.mjs --root . [--check]
```

The token carries the minimal `iam:self` bootstrap scope, matching
`backend.accessTokenPermissionScope` in `agent.app.config.json`.
