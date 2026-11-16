use sdkwork_id_core::SnowflakeIdGenerator;
use sdkwork_intelligence_plugins_service::{PluginsResult, PluginsServiceError};
use sdkwork_plugins_contract::{
    PluginCategoryRecord, PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus,
    PluginRecord, PluginVisibility,
};
use sdkwork_utils_rust::{CatalogViewFilter, LIST_TOTAL_SQL_COLUMN};
use sqlx::{PgPool, Row};

use crate::entity_ids::{new_plugins_snowflake_id, new_plugins_uuid};
use crate::json_util::{string_list_from_json, string_list_to_json, timestamp_to_rfc3339};

macro_rules! active_entity_filter {
    () => {
        "deleted_at IS NULL AND lifecycle_status <> 4"
    };
}

macro_rules! catalog_visible_filter {
    () => {
        "deleted_at IS NULL AND lifecycle_status = 1"
    };
}

const ACTIVE_ENTITY_FILTER: &str = active_entity_filter!();

/// Catalog visibility: only `active` rows. The marketplace surface and the
/// admin inventory therefore read the same table through two documented
/// predicates instead of one predicate both callers reinterpret.
const CATALOG_VISIBLE_FILTER: &str = catalog_visible_filter!();

macro_rules! category_columns {
    () => {
        "id, uuid, tenant_id, organization_id, category_code, name, description, sort_order, \
         lifecycle_status, version, created_at, updated_at, created_by, updated_by, deleted_at"
    };
}

macro_rules! plugin_columns {
    () => {
        "id, uuid, tenant_id, organization_id, plugin_key, name, description, category_id, \
         category_code, version_label, provider, implementation_type, visibility, manifest_json, \
         source_json, install_status, lifecycle_status, tags_json, allowed_role_codes_json, \
         version, created_at, updated_at, created_by, updated_by, deleted_at"
    };
}

const CATEGORY_SELECT: &str = category_columns!();

const PLUGIN_SELECT: &str = plugin_columns!();

/// Keyword predicate for one plugin page: `$2` holds the nullable `%kw%`
/// pattern, folded once by the caller.
macro_rules! plugin_keyword_predicate {
    () => {
        "($2::text IS NULL OR LOWER(plugin_key) LIKE $2 OR LOWER(name) LIKE $2 \
         OR LOWER(COALESCE(description, '')) LIKE $2 \
         OR LOWER(COALESCE(category_code, '')) LIKE $2 \
         OR LOWER(tags_json::text) LIKE $2)"
    };
}

/// Keyword predicate for one category page: `$2` holds the nullable `%kw%`
/// pattern, folded once by the caller.
macro_rules! category_keyword_predicate {
    () => {
        "($2::text IS NULL OR LOWER(name) LIKE $2 OR LOWER(category_code) LIKE $2 \
         OR LOWER(COALESCE(description, '')) LIKE $2)"
    };
}

/// Category half of the catalog view: `$3` holds the nullable selector.
macro_rules! category_code_predicate {
    () => {
        "($3::text IS NULL OR LOWER(category_code) = $3)"
    };
}

/// Role half of the catalog view: `$4` holds the caller's role codes.
///
/// An empty scope keeps the all-data view, an empty assignment is open to every
/// role, and a populated scope matches the records naming one of its codes.
macro_rules! plugin_role_predicate {
    () => {
        "(cardinality($4::text[]) = 0 \
         OR jsonb_array_length(allowed_role_codes_json) = 0 \
         OR allowed_role_codes_json ?| $4::text[])"
    };
}

/// Admin plugin page: one statement whose window count comes from the same
/// filtered set the page is cut from.
const PLUGIN_PAGE_SQL_ADMIN: &str = concat!(
    "SELECT ",
    plugin_columns!(),
    ", COUNT(*) OVER() AS __list_total FROM ai_plugin WHERE tenant_id = $1 AND ",
    active_entity_filter!(),
    " AND ",
    plugin_keyword_predicate!(),
    " AND ",
    category_code_predicate!(),
    " AND ",
    plugin_role_predicate!(),
    " ORDER BY updated_at DESC, plugin_key ASC LIMIT $5 OFFSET $6"
);

/// Catalog plugin page: the marketplace reads only `active` rows, and its
/// window count therefore never includes admin-only rows.
const PLUGIN_PAGE_SQL_CATALOG: &str = concat!(
    "SELECT ",
    plugin_columns!(),
    ", COUNT(*) OVER() AS __list_total FROM ai_plugin WHERE tenant_id = $1 AND ",
    catalog_visible_filter!(),
    " AND ",
    plugin_keyword_predicate!(),
    " AND ",
    category_code_predicate!(),
    " AND ",
    plugin_role_predicate!(),
    " ORDER BY updated_at DESC, plugin_key ASC LIMIT $5 OFFSET $6"
);

/// Admin category page; categories carry no role list, so the page predicate
/// stops after the keyword and the selector.
const CATEGORY_PAGE_SQL_ADMIN: &str = concat!(
    "SELECT ",
    category_columns!(),
    ", COUNT(*) OVER() AS __list_total FROM ai_plugin_category ",
    "WHERE tenant_id IN (0, $1) AND ",
    active_entity_filter!(),
    " AND ",
    category_keyword_predicate!(),
    " AND ",
    category_code_predicate!(),
    " ORDER BY sort_order ASC, category_code ASC LIMIT $4 OFFSET $5"
);

/// Catalog category page: only `active` rows are counted and returned.
const CATEGORY_PAGE_SQL_CATALOG: &str = concat!(
    "SELECT ",
    category_columns!(),
    ", COUNT(*) OVER() AS __list_total FROM ai_plugin_category ",
    "WHERE tenant_id IN (0, $1) AND ",
    catalog_visible_filter!(),
    " AND ",
    category_keyword_predicate!(),
    " AND ",
    category_code_predicate!(),
    " ORDER BY sort_order ASC, category_code ASC LIMIT $4 OFFSET $5"
);

/// Case-folded `%keyword%` pattern bound to the keyword placeholders; `None`
/// keeps the unfiltered view.
fn keyword_pattern(keyword: Option<&str>) -> Option<String> {
    keyword
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("%{}%", value.to_lowercase()))
}

/// Reads the `COUNT(*) OVER()` total from the first row and maps the page.
///
/// The window counts the whole filtered set, so an in-range page carries the
/// exact total. A page past the end has no row to carry it and reports zero
/// here; the paged readers re-read the first row of the same query in that case
/// so `pageInfo.totalItems` never depends on the requested page.
fn page<T>(
    rows: Vec<sqlx::postgres::PgRow>,
    mapper: fn(&sqlx::postgres::PgRow) -> PluginsResult<T>,
) -> PluginsResult<(Vec<T>, i64)> {
    let total = rows
        .first()
        .and_then(|row| row.try_get::<i64, _>(LIST_TOTAL_SQL_COLUMN).ok())
        .unwrap_or(0);
    let items = rows.iter().map(mapper).collect::<PluginsResult<Vec<_>>>()?;
    Ok((items, total))
}

fn map_sqlx(error: sqlx::Error) -> PluginsServiceError {
    PluginsServiceError::Repository(error.to_string())
}

fn resolve_entity_id(generator: &SnowflakeIdGenerator, id: i64) -> i64 {
    if id == 0 {
        new_plugins_snowflake_id(generator)
    } else {
        id
    }
}

fn resolve_entity_uuid(uuid: &str) -> String {
    if uuid.is_empty() {
        new_plugins_uuid()
    } else {
        uuid.to_string()
    }
}

fn read_json_string(row: &sqlx::postgres::PgRow, field: &str) -> PluginsResult<String> {
    let value: serde_json::Value = row
        .try_get::<serde_json::Value, _>(field)
        .map_err(map_sqlx)?;
    serde_json::to_string(&value).map_err(|error| {
        PluginsServiceError::Repository(format!("encode {field} json failed: {error}"))
    })
}

fn map_implementation(value: &str) -> PluginsResult<PluginImplementationType> {
    PluginImplementationType::parse(value).ok_or_else(|| {
        PluginsServiceError::Repository(format!("invalid implementation_type: {value}"))
    })
}

fn map_visibility(value: &str) -> PluginsResult<PluginVisibility> {
    PluginVisibility::parse(value)
        .ok_or_else(|| PluginsServiceError::Repository(format!("invalid visibility: {value}")))
}

fn map_install_status(value: &str) -> PluginsResult<PluginInstallStatus> {
    PluginInstallStatus::parse(value)
        .ok_or_else(|| PluginsServiceError::Repository(format!("invalid install_status: {value}")))
}

fn map_lifecycle(value: i16) -> PluginsResult<PluginLifecycleStatus> {
    PluginLifecycleStatus::from_db_code(value).ok_or_else(|| {
        PluginsServiceError::Repository(format!("invalid lifecycle status: {value}"))
    })
}

fn row_to_category(row: &sqlx::postgres::PgRow) -> PluginsResult<PluginCategoryRecord> {
    Ok(PluginCategoryRecord {
        id: row.try_get::<i64, _>("id").map_err(map_sqlx)?,
        uuid: row.try_get("uuid").map_err(map_sqlx)?,
        category_code: row.try_get("category_code").map_err(map_sqlx)?,
        name: row.try_get("name").map_err(map_sqlx)?,
        description: row.try_get("description").map_err(map_sqlx)?,
        sort_order: row.try_get("sort_order").map_err(map_sqlx)?,
        lifecycle_status: map_lifecycle(row.try_get("lifecycle_status").map_err(map_sqlx)?)?,
        version: row.try_get::<i64, _>("version").map_err(map_sqlx)?,
        created_at: timestamp_to_rfc3339(row.try_get("created_at").map_err(map_sqlx)?),
        updated_at: timestamp_to_rfc3339(row.try_get("updated_at").map_err(map_sqlx)?),
    })
}

fn row_to_plugin(row: &sqlx::postgres::PgRow) -> PluginsResult<PluginRecord> {
    Ok(PluginRecord {
        id: row.try_get::<i64, _>("id").map_err(map_sqlx)?,
        uuid: row.try_get("uuid").map_err(map_sqlx)?,
        plugin_key: row.try_get("plugin_key").map_err(map_sqlx)?,
        name: row.try_get("name").map_err(map_sqlx)?,
        description: row.try_get("description").map_err(map_sqlx)?,
        category_id: row
            .try_get::<Option<i64>, _>("category_id")
            .map_err(map_sqlx)?,
        category_code: row.try_get("category_code").map_err(map_sqlx)?,
        version_label: row.try_get("version_label").map_err(map_sqlx)?,
        provider: row.try_get("provider").map_err(map_sqlx)?,
        implementation_type: map_implementation(
            row.try_get::<String, _>("implementation_type")
                .map_err(map_sqlx)?
                .as_str(),
        )?,
        visibility: map_visibility(
            row.try_get::<String, _>("visibility")
                .map_err(map_sqlx)?
                .as_str(),
        )?,
        manifest: row.try_get("manifest_json").map_err(map_sqlx)?,
        source: row
            .try_get::<Option<serde_json::Value>, _>("source_json")
            .map_err(map_sqlx)?
            .map(serde_json::from_value)
            .transpose()
            .map_err(|error| {
                PluginsServiceError::Repository(format!("invalid source_json: {error}"))
            })?,
        install_status: map_install_status(
            row.try_get::<String, _>("install_status")
                .map_err(map_sqlx)?
                .as_str(),
        )?,
        tags: string_list_from_json(read_json_string(row, "tags_json")?.as_str(), "tags_json")?,
        allowed_role_codes: string_list_from_json(
            read_json_string(row, "allowed_role_codes_json")?.as_str(),
            "allowed_role_codes_json",
        )?,
        lifecycle_status: map_lifecycle(row.try_get("lifecycle_status").map_err(map_sqlx)?)?,
        version: row.try_get::<i64, _>("version").map_err(map_sqlx)?,
        created_at: timestamp_to_rfc3339(row.try_get("created_at").map_err(map_sqlx)?),
        updated_at: timestamp_to_rfc3339(row.try_get("updated_at").map_err(map_sqlx)?),
    })
}

pub async fn list_categories(
    pool: &PgPool,
    tenant_id: u64,
) -> PluginsResult<Vec<PluginCategoryRecord>> {
    let query = format!(
        r#"
        SELECT {CATEGORY_SELECT}
        FROM ai_plugin_category
        WHERE tenant_id IN (0, $1) AND {ACTIVE_ENTITY_FILTER}
        ORDER BY sort_order ASC, category_code ASC
        "#
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    rows.iter().map(row_to_category).collect()
}

/// Catalog-visible categories: only `active` rows, in registry order.
///
/// The marketplace surface lists the taxonomy a visitor can file against;
/// draft, disabled and archived categories stay admin-only through
/// [`ACTIVE_ENTITY_FILTER`] on [`list_categories`].
pub async fn list_catalog_categories(
    pool: &PgPool,
    tenant_id: u64,
) -> PluginsResult<Vec<PluginCategoryRecord>> {
    let query = format!(
        r#"
        SELECT {CATEGORY_SELECT}
        FROM ai_plugin_category
        WHERE tenant_id IN (0, $1) AND {CATALOG_VISIBLE_FILTER}
        ORDER BY sort_order ASC, category_code ASC
        "#
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    rows.iter().map(row_to_category).collect()
}

/// Admin category page with store-side filtering and an exact filtered total.
pub async fn list_categories_page(
    pool: &PgPool,
    tenant_id: u64,
    filter: &CatalogViewFilter,
    keyword: Option<&str>,
    limit: i64,
    offset: i64,
) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)> {
    let rows = sqlx::query(CATEGORY_PAGE_SQL_ADMIN)
        .bind(tenant_id as i64)
        .bind(keyword_pattern(keyword))
        .bind(filter.category_code())
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    let (items, mut total) = page(rows, row_to_category)?;
    if items.is_empty() && offset > 0 {
        total = sqlx::query(CATEGORY_PAGE_SQL_ADMIN)
            .bind(tenant_id as i64)
            .bind(keyword_pattern(keyword))
            .bind(filter.category_code())
            .bind(1_i64)
            .bind(0_i64)
            .fetch_optional(pool)
            .await
            .map_err(map_sqlx)?
            .and_then(|row| row.try_get::<i64, _>(LIST_TOTAL_SQL_COLUMN).ok())
            .unwrap_or(0);
    }
    Ok((items, total))
}

/// Catalog category page: the total counts only the visible, filtered rows.
pub async fn list_catalog_categories_page(
    pool: &PgPool,
    tenant_id: u64,
    filter: &CatalogViewFilter,
    keyword: Option<&str>,
    limit: i64,
    offset: i64,
) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)> {
    let rows = sqlx::query(CATEGORY_PAGE_SQL_CATALOG)
        .bind(tenant_id as i64)
        .bind(keyword_pattern(keyword))
        .bind(filter.category_code())
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    let (items, mut total) = page(rows, row_to_category)?;
    if items.is_empty() && offset > 0 {
        total = sqlx::query(CATEGORY_PAGE_SQL_CATALOG)
            .bind(tenant_id as i64)
            .bind(keyword_pattern(keyword))
            .bind(filter.category_code())
            .bind(1_i64)
            .bind(0_i64)
            .fetch_optional(pool)
            .await
            .map_err(map_sqlx)?
            .and_then(|row| row.try_get::<i64, _>(LIST_TOTAL_SQL_COLUMN).ok())
            .unwrap_or(0);
    }
    Ok((items, total))
}

pub async fn get_category(
    pool: &PgPool,
    tenant_id: u64,
    category_code: &str,
) -> PluginsResult<PluginCategoryRecord> {
    let query = format!(
        r#"
        SELECT {CATEGORY_SELECT}
        FROM ai_plugin_category
        WHERE tenant_id = $1 AND category_code = $2 AND deleted_at IS NULL
        LIMIT 1
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(category_code)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_category)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(category_code.to_string()))
}

pub async fn upsert_category(
    pool: &PgPool,
    id_generator: &SnowflakeIdGenerator,
    tenant_id: u64,
    operator_id: u64,
    record: PluginCategoryRecord,
) -> PluginsResult<PluginCategoryRecord> {
    let id = resolve_entity_id(id_generator, record.id);
    let uuid = resolve_entity_uuid(&record.uuid);
    let query = format!(
        r#"
        INSERT INTO ai_plugin_category (
            id, uuid, tenant_id, category_code, name, description, sort_order,
            lifecycle_status, version, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, category_code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            lifecycle_status = EXCLUDED.lifecycle_status,
            version = ai_plugin_category.version + 1,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP,
            deleted_at = NULL
        RETURNING {CATEGORY_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(id)
        .bind(uuid)
        .bind(tenant_id as i64)
        .bind(&record.category_code)
        .bind(&record.name)
        .bind(&record.description)
        .bind(record.sort_order)
        .bind(record.lifecycle_status.as_db_code())
        .bind(record.version)
        .bind(operator_id as i64)
        .bind(operator_id as i64)
        .fetch_one(pool)
        .await
        .map_err(map_sqlx)?;
    row_to_category(&row)
}

pub async fn list_plugins(pool: &PgPool, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>> {
    let query = format!(
        r#"
        SELECT {PLUGIN_SELECT}
        FROM ai_plugin
        WHERE tenant_id = $1 AND {ACTIVE_ENTITY_FILTER}
        ORDER BY updated_at DESC, plugin_key ASC
        "#
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    rows.iter().map(row_to_plugin).collect()
}

/// Admin plugin page with store-side filtering and an exact filtered total.
pub async fn list_plugins_page(
    pool: &PgPool,
    tenant_id: u64,
    filter: &CatalogViewFilter,
    keyword: Option<&str>,
    limit: i64,
    offset: i64,
) -> PluginsResult<(Vec<PluginRecord>, i64)> {
    let rows = sqlx::query(PLUGIN_PAGE_SQL_ADMIN)
        .bind(tenant_id as i64)
        .bind(keyword_pattern(keyword))
        .bind(filter.category_code())
        .bind(filter.role_codes().to_vec())
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    let (items, mut total) = page(rows, row_to_plugin)?;
    if items.is_empty() && offset > 0 {
        total = sqlx::query(PLUGIN_PAGE_SQL_ADMIN)
            .bind(tenant_id as i64)
            .bind(keyword_pattern(keyword))
            .bind(filter.category_code())
            .bind(filter.role_codes().to_vec())
            .bind(1_i64)
            .bind(0_i64)
            .fetch_optional(pool)
            .await
            .map_err(map_sqlx)?
            .and_then(|row| row.try_get::<i64, _>(LIST_TOTAL_SQL_COLUMN).ok())
            .unwrap_or(0);
    }
    Ok((items, total))
}

/// Catalog-visible plugins: only `active` rows, newest first.
///
/// Draft, disabled and archived plugins stay admin-only through
/// [`ACTIVE_ENTITY_FILTER`] on [`list_plugins`]; the marketplace never offers
/// a card a visitor cannot install.
pub async fn list_catalog_plugins(
    pool: &PgPool,
    tenant_id: u64,
) -> PluginsResult<Vec<PluginRecord>> {
    let query = format!(
        r#"
        SELECT {PLUGIN_SELECT}
        FROM ai_plugin
        WHERE tenant_id = $1 AND {CATALOG_VISIBLE_FILTER}
        ORDER BY updated_at DESC, plugin_key ASC
        "#
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    rows.iter().map(row_to_plugin).collect()
}

/// Catalog plugin page: the total counts only the visible, filtered rows.
pub async fn list_catalog_plugins_page(
    pool: &PgPool,
    tenant_id: u64,
    filter: &CatalogViewFilter,
    keyword: Option<&str>,
    limit: i64,
    offset: i64,
) -> PluginsResult<(Vec<PluginRecord>, i64)> {
    let rows = sqlx::query(PLUGIN_PAGE_SQL_CATALOG)
        .bind(tenant_id as i64)
        .bind(keyword_pattern(keyword))
        .bind(filter.category_code())
        .bind(filter.role_codes().to_vec())
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    let (items, mut total) = page(rows, row_to_plugin)?;
    if items.is_empty() && offset > 0 {
        total = sqlx::query(PLUGIN_PAGE_SQL_CATALOG)
            .bind(tenant_id as i64)
            .bind(keyword_pattern(keyword))
            .bind(filter.category_code())
            .bind(filter.role_codes().to_vec())
            .bind(1_i64)
            .bind(0_i64)
            .fetch_optional(pool)
            .await
            .map_err(map_sqlx)?
            .and_then(|row| row.try_get::<i64, _>(LIST_TOTAL_SQL_COLUMN).ok())
            .unwrap_or(0);
    }
    Ok((items, total))
}

pub async fn get_plugin(
    pool: &PgPool,
    tenant_id: u64,
    plugin_key: &str,
) -> PluginsResult<PluginRecord> {
    let query = format!(
        r#"
        SELECT {PLUGIN_SELECT}
        FROM ai_plugin
        WHERE tenant_id = $1 AND plugin_key = $2 AND deleted_at IS NULL
        LIMIT 1
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(plugin_key)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_plugin)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(plugin_key.to_string()))
}

pub async fn create_plugin(
    pool: &PgPool,
    id_generator: &SnowflakeIdGenerator,
    tenant_id: u64,
    operator_id: u64,
    record: PluginRecord,
) -> PluginsResult<PluginRecord> {
    let id = resolve_entity_id(id_generator, record.id);
    let uuid = resolve_entity_uuid(&record.uuid);
    let tags_json = bind_string_list(&record.tags, "tags")?;
    let role_codes_json = bind_string_list(&record.allowed_role_codes, "allowed_role_codes")?;
    let source_json = record
        .source
        .as_ref()
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| {
            PluginsServiceError::Repository(format!("encode source_json failed: {error}"))
        })?;
    let query = format!(
        r#"
        INSERT INTO ai_plugin (
            id, uuid, tenant_id, plugin_key, name, description, category_id, category_code,
            version_label, provider, implementation_type, visibility, manifest_json, source_json,
            install_status, lifecycle_status, tags_json, allowed_role_codes_json, version,
            created_by, updated_by
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, $21
        )
        RETURNING {PLUGIN_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(id)
        .bind(uuid)
        .bind(tenant_id as i64)
        .bind(&record.plugin_key)
        .bind(&record.name)
        .bind(&record.description)
        .bind(record.category_id)
        .bind(&record.category_code)
        .bind(&record.version_label)
        .bind(&record.provider)
        .bind(record.implementation_type.as_str())
        .bind(record.visibility.as_str())
        .bind(record.manifest.clone())
        .bind(source_json)
        .bind(record.install_status.as_str())
        .bind(record.lifecycle_status.as_db_code())
        .bind(tags_json)
        .bind(role_codes_json)
        .bind(record.version)
        .bind(operator_id as i64)
        .bind(operator_id as i64)
        .fetch_one(pool)
        .await
        .map_err(map_sqlx)?;
    row_to_plugin(&row)
}

pub async fn update_plugin(
    pool: &PgPool,
    tenant_id: u64,
    operator_id: u64,
    plugin_key: &str,
    record: PluginRecord,
) -> PluginsResult<PluginRecord> {
    let tags_json = bind_string_list(&record.tags, "tags")?;
    let role_codes_json = bind_string_list(&record.allowed_role_codes, "allowed_role_codes")?;
    let source_json = record
        .source
        .as_ref()
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| {
            PluginsServiceError::Repository(format!("encode source_json failed: {error}"))
        })?;
    let query = format!(
        r#"
        UPDATE ai_plugin SET
            name = $3,
            description = $4,
            category_id = $5,
            category_code = $6,
            version_label = $7,
            provider = $8,
            implementation_type = $9,
            visibility = $10,
            manifest_json = $11,
            source_json = $12,
            install_status = $13,
            lifecycle_status = $14,
            tags_json = $15,
            allowed_role_codes_json = $16,
            version = ai_plugin.version + 1,
            updated_by = $17,
            updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND plugin_key = $2 AND deleted_at IS NULL
        RETURNING {PLUGIN_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(plugin_key)
        .bind(&record.name)
        .bind(&record.description)
        .bind(record.category_id)
        .bind(&record.category_code)
        .bind(&record.version_label)
        .bind(&record.provider)
        .bind(record.implementation_type.as_str())
        .bind(record.visibility.as_str())
        .bind(record.manifest.clone())
        .bind(source_json)
        .bind(record.install_status.as_str())
        .bind(record.lifecycle_status.as_db_code())
        .bind(tags_json)
        .bind(role_codes_json)
        .bind(operator_id as i64)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_plugin)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(plugin_key.to_string()))
}

pub async fn delete_plugin(
    pool: &PgPool,
    tenant_id: u64,
    plugin_key: &str,
) -> PluginsResult<PluginRecord> {
    let query = format!(
        r#"
        UPDATE ai_plugin
        SET lifecycle_status = 4, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND plugin_key = $2 AND deleted_at IS NULL
        RETURNING {PLUGIN_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(plugin_key)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    row.as_ref()
        .map(row_to_plugin)
        .transpose()?
        .ok_or_else(|| PluginsServiceError::NotFound(plugin_key.to_string()))
}

fn bind_string_list(items: &[String], field: &str) -> PluginsResult<serde_json::Value> {
    let encoded = string_list_to_json(items, field)?;
    serde_json::from_str(&encoded).map_err(|error| {
        PluginsServiceError::Repository(format!("encode {field} json failed: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paged_queries_select_through_the_documented_visibility_filter() {
        assert!(PLUGIN_PAGE_SQL_ADMIN.contains(ACTIVE_ENTITY_FILTER));
        assert!(PLUGIN_PAGE_SQL_CATALOG.contains(CATALOG_VISIBLE_FILTER));
        assert!(CATEGORY_PAGE_SQL_ADMIN.contains(ACTIVE_ENTITY_FILTER));
        assert!(CATEGORY_PAGE_SQL_CATALOG.contains(CATALOG_VISIBLE_FILTER));

        // A copy-paste swap would list admin-only rows (or hide live ones).
        assert!(!PLUGIN_PAGE_SQL_ADMIN.contains(CATALOG_VISIBLE_FILTER));
        assert!(!PLUGIN_PAGE_SQL_CATALOG.contains(ACTIVE_ENTITY_FILTER));
        assert!(!CATEGORY_PAGE_SQL_ADMIN.contains(CATALOG_VISIBLE_FILTER));
        assert!(!CATEGORY_PAGE_SQL_CATALOG.contains(ACTIVE_ENTITY_FILTER));
    }

    #[test]
    fn paged_queries_count_and_window_in_one_statement() {
        for sql in [PLUGIN_PAGE_SQL_ADMIN, PLUGIN_PAGE_SQL_CATALOG] {
            assert!(sql.contains("COUNT(*) OVER()"));
            assert!(sql.contains(LIST_TOTAL_SQL_COLUMN));
            assert!(sql.contains("LIMIT $5 OFFSET $6"));
            assert!(sql.contains(plugin_keyword_predicate!()));
            assert!(sql.contains(category_code_predicate!()));
            assert!(sql.contains(plugin_role_predicate!()));
        }
        for sql in [CATEGORY_PAGE_SQL_ADMIN, CATEGORY_PAGE_SQL_CATALOG] {
            assert!(sql.contains("COUNT(*) OVER()"));
            assert!(sql.contains(LIST_TOTAL_SQL_COLUMN));
            assert!(sql.contains("LIMIT $4 OFFSET $5"));
            assert!(sql.contains(category_keyword_predicate!()));
            assert!(sql.contains(category_code_predicate!()));
            // Categories carry no role list, so no role predicate is applied.
            assert!(!sql.contains("allowed_role_codes_json"));
        }
    }
}
