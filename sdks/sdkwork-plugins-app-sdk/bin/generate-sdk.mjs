#!/usr/bin/env node
import { resolveFamilySdkRoot, runPluginsSdkGenerator } from "../../../tools/plugins_sdk_generator_runner.mjs";

runPluginsSdkGenerator(
  {
    apiAuthority: "sdkwork-plugins.app",
    apiPrefix: "/app/v3/api",
    defaultBaseUrl: "http://127.0.0.1:18101",
    defaultOpenapiRelativePath: "app-api/plugins/plugins-app-api.openapi.json",
    sdkName: "sdkwork-plugins-app-sdk",
    sdkRoot: resolveFamilySdkRoot(import.meta.url),
    sdkType: "app",
  },
  process.argv.slice(2),
);
