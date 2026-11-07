# SDKWork Plugins standalone server image.
# Build through bin/docker-image.sh (MODULE_BIN_SPEC.md §2); the image tag is
# resolved from agent.app.config.json release.currentVersion.
FROM rust:1.85-slim AS build
WORKDIR /build
COPY . .
RUN cargo build --release -p sdkwork-api-plugins-standalone-gateway

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/target/release/sdkwork-api-plugins-standalone-gateway /usr/local/bin/sdkwork-api-plugins-standalone-gateway
ENV SDKWORK_PLUGINS_APPLICATION_PUBLIC_INGRESS_BIND=0.0.0.0:18101
EXPOSE 18101
ENTRYPOINT ["/usr/local/bin/sdkwork-api-plugins-standalone-gateway"]
