# Module identity for the standardized bin/ entrypoints (MODULE_BIN_SPEC.md §3).
# The generic wrappers in bin/ source bin/lib/bootstrap.sh, which resolves the
# shared libraries under ../sdkwork-specs/bin/lib/.
SDKWORK_MODULE_ID="plugins"
SDKWORK_IMAGE_NAME="sdkwork-plugins-standalone"
SDKWORK_APP_TYPES="server"
SDKWORK_DOCKERFILE="deployments/docker/Dockerfile"
SDKWORK_CARGO_RELEASE_BIN="sdkwork-api-plugins-standalone-gateway"

sdkwork_installer_app() {
  local app_type="$1" platform="$2" environment="$3" profile="$4" out="$5" arch="$6" format="$7"
  sdkwork_die "${SDKWORK_BIN_E_STATE}"     "sdkwork-plugins has no native installer builder wired yet; implement sdkwork_installer_app against the repository's installer commands (MODULE_BIN_SPEC.md §4.9; platforms: windows|linux|macos|android|ios)"
}

sdkwork_image_build() {
  local ref="$1" tag="$2"
  # Canonical container build: self-contained multi-stage Dockerfile at deployments/docker/Dockerfile
  # (build context = repository root). Wires MODULE_BIN_SPEC.md §4.1; the
  # shared entrypoint asserts the ${ref} image exists after this returns.
  sdkwork_local_run docker build -f "deployments/docker/Dockerfile" -t "${ref}" .
}

sdkwork_deploy_app() {
  local app_type="$1" action="$2" environment="$3" profile="$4" host="$5"
  sdkwork_die "${SDKWORK_BIN_E_STATE}"     "sdkwork-plugins has no application deployment channel wired yet; implement sdkwork_deploy_app (host-native install via bin/apps-package artifacts, MODULE_BIN_SPEC.md §4.5)"
}

sdkwork_build_app() {
  local app_type="$1" environment="$2" profile="$3"
  case "${app_type}" in
    server)
      sdkwork_local_run cargo build --release -p sdkwork-api-plugins-standalone-gateway ;;
    *)
      sdkwork_die "${SDKWORK_BIN_E_ENV}"         "app type '${app_type}' has no wired build for sdkwork-plugins; extend sdkwork_build_app with the repository's canonical runner (declared: ${SDKWORK_APP_TYPES})" ;;
  esac
}

sdkwork_package_app() {
  local app_type="$1" environment="$2" profile="$3" out="$4"
  sdkwork_die "${SDKWORK_BIN_E_STATE}"     "sdkwork-plugins has no canonical release packager wired yet; implement sdkwork_package_app against the repository's packaging command (MODULE_BIN_SPEC.md §4.4)"
}
