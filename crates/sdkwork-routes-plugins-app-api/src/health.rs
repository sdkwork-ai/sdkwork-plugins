use axum::Json;
use sdkwork_web_bootstrap::{ReadinessCheck, ReadinessFuture};
use serde_json::{json, Value};
use sqlx::PgPool;

#[derive(Clone)]
pub struct DbReadinessCheck {
    pool: PgPool,
}

impl DbReadinessCheck {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn check(&self) -> Result<(), sqlx::Error> {
        sqlx::query_scalar::<_, i64>("SELECT 1::bigint")
            .fetch_one(&self.pool)
            .await
            .map(|_| ())
    }
}

impl ReadinessCheck for DbReadinessCheck {
    fn check(&self) -> ReadinessFuture<'_> {
        let pool = self.pool.clone();
        Box::pin(async move {
            sqlx::query_scalar::<_, i64>("SELECT 1::bigint")
                .fetch_one(&pool)
                .await
                .map(|_| ())
                .map_err(|error| error.to_string())
        })
    }
}

pub async fn livez() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

pub async fn readyz_with_state(
    readiness: Option<DbReadinessCheck>,
) -> Result<Json<Value>, (axum::http::StatusCode, String)> {
    if let Some(readiness) = readiness {
        readiness.check().await.map_err(|error| {
            (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                format!("dependencies unavailable: {error}"),
            )
        })?;
    }
    Ok(Json(json!({ "status": "ok" })))
}

pub async fn healthz_with_state(
    readiness: Option<DbReadinessCheck>,
) -> Result<Json<Value>, (axum::http::StatusCode, String)> {
    readyz_with_state(readiness).await
}
