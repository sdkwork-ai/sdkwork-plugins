#!/usr/bin/env node
import { resolveFamilySdkRoot, runPluginsSdkGenerator } from "../../../tools/plugins_sdk_generator_runner.mjs";

runPluginsSdkGenerator(
  {
    apiAuthority: "sdkwork-plugins.backend",
    apiPrefix: "/backend/v3/api",
    defaultBaseUrl: "http://127.0.0.1:18101",
    defaultOpenapiRelativePath: "backend-api/plugins/plugins-backend-api.openapi.json",
    sdkName: "sdkwork-plugins-backend-sdk",
    sdkRoot: resolveFamilySdkRoot(import.meta.url),
    sdkType: "backend",
  },
  process.argv.slice(2),
);
