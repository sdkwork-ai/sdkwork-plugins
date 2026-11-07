use std::path::PathBuf;
use std::sync::Arc;

use sdkwork_database_config::DatabaseConfig;
use sdkwork_database_drift::DriftEngine;
use sdkwork_database_lifecycle::{lifecycle_options_from_env, LifecycleOrchestrator};
use sdkwork_database_spi::{DatabaseAssetProvider, DatabaseManifest, DefaultDatabaseModule};
use sdkwork_database_sqlx::{create_pool_from_config, DatabasePool};
use sdkwork_id_core::{SnowflakeIdGenerator, SnowflakeIdError};
use std::time::Duration;

pub const MODULE_ID: &str = "plugins";

const DEFAULT_PLUGINS_SNOWFLAKE_NODE_ID: u16 = 4;

pub struct PluginsDatabaseHost {
    pool: DatabasePool,
    module: Arc<DefaultDatabaseModule>,
    id_generator: Arc<SnowflakeIdGenerator>,
}

impl PluginsDatabaseHost {
    pub fn pool(&self) -> &DatabasePool {
        &self.pool
    }

    pub fn postgres_pool(&self) -> Option<sqlx::PgPool> {
        self.pool.as_postgres().cloned()
    }

    pub fn module(&self) -> Arc<DefaultDatabaseModule> {
        self.module.clone()
    }

    /// Process-wide snowflake id generator for `ai_plugin_*` primary keys.
    pub fn id_generator(&self) -> Arc<SnowflakeIdGenerator> {
        self.id_generator.clone()
    }
}

fn plugins_snowflake_generator() -> Arc<SnowflakeIdGenerator> {
    let node_id = std::env::var("SDKWORK_PLUGINS_SNOWFLAKE_NODE_ID")
        .ok()
        .and_then(|value| value.trim().parse::<u16>().ok())
        .filter(|value| *value <= sdkwork_id_core::max_snowflake_node_id())
        .unwrap_or(DEFAULT_PLUGINS_SNOWFLAKE_NODE_ID);
    Arc::new(
        SnowflakeIdGenerator::new(node_id)
            .expect("plugins snowflake node id must be valid"),
    )
}

/// Mints one positive snowflake id, waiting out sequence exhaustion.
pub fn new_plugins_snowflake_id(generator: &SnowflakeIdGenerator) -> i64 {
    loop {
        match generator.generate() {
            Ok(id) if id > 0 => return id,
            Ok(_) => continue,
            Err(SnowflakeIdError::SequenceExhausted { .. }) => {
                std::thread::sleep(Duration::from_millis(1));
            }
            Err(error) => panic!("generate plugins snowflake id failed: {error:?}"),
        }
    }
}

pub async fn bootstrap_plugins_database(pool: DatabasePool) -> Result<PluginsDatabaseHost, String> {
    let app_root = resolve_app_root();
    let module = Arc::new(
        DefaultDatabaseModule::from_app_root(&app_root)
            .map_err(|error| format!("load plugins database module failed: {error}"))?,
    );
    let manifest = DatabaseManifest::from_file(module.manifest_path())
        .map_err(|error| format!("read plugins database manifest failed: {error}"))?;
    let options = lifecycle_options_from_env("PLUGINS", &manifest);
    let orchestrator =
        LifecycleOrchestrator::new(pool.clone(), module.clone()).with_applied_by("sdkwork-plugins");

    orchestrator
        .init()
        .await
        .map_err(|error| format!("plugins database init failed: {error}"))?;

    if options.auto_migrate {
        orchestrator
            .migrate()
            .await
            .map_err(|error| format!("plugins database migrate failed: {error}"))?;
    }

    // DATABASE_SPEC §35: readiness must fail when required migrations are
    // missing or the schema drifts from the contract. Drift is observation only
    // (DATABASE_FRAMEWORK_SPEC §4.2); repair runs `db:migrate`. The plugins
    // module is composed same-origin by the standalone gateway, so a drift here
    // would otherwise surface as a request-time error against a surface the
    // composition layer already declared as served (DATABASE_FRAMEWORK_SPEC
    // §4.4.1).
    let drift = DriftEngine::new(pool.clone(), module.clone())
        .analyze()
        .await
        .map_err(|error| format!("plugins database drift check failed: {error}"))?;
    if drift.summary.error > 0 {
        let details = drift
            .diffs
            .iter()
            .filter(|diff| diff.severity == "error")
            .take(5)
            .map(|diff| diff.message.as_str())
            .collect::<Vec<_>>()
            .join("; ");
        return Err(format!(
            "plugins database schema drift detected ({} error(s)): {details}. Run `pnpm db:migrate` and then `pnpm db:drift:check`",
            drift.summary.error
        ));
    }

    Ok(PluginsDatabaseHost {
        pool,
        module,
        id_generator: plugins_snowflake_generator(),
    })
}

pub async fn bootstrap_plugins_database_from_env() -> Result<PluginsDatabaseHost, String> {
    let _ = dotenvy::dotenv();
    let config = DatabaseConfig::from_env("PLUGINS")
        .map_err(|error| format!("read plugins database config failed: {error}"))?;
    let pool = create_pool_from_config(config)
        .await
        .map_err(|error| format!("create plugins database pool failed: {error}"))?;
    bootstrap_plugins_database(pool).await
}

fn resolve_app_root() -> PathBuf {
    std::env::var("SDKWORK_PLUGINS_APP_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../..")
                .canonicalize()
                .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."))
        })
}
