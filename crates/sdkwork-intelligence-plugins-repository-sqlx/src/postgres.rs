use std::collections::HashMap;

use sdkwork_id_core::SnowflakeIdGenerator;
use sdkwork_intelligence_plugins_service::{PluginCatalogSort, PluginsResult, PluginsServiceError};
use sdkwork_plugins_contract::{
    PluginCategoryRecord, PluginImplementationType, PluginInstallStatus, PluginInstallTarget,
    PluginLifecycleStatus, PluginMarketplaceMetadata, PluginMedia, PluginRecord, PluginVisibility,
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
        "id, uuid, tenant_id, organization_id, category_code, name, description, name_locales_json, description_locales_json, sort_order, \
         lifecycle_status, version, created_at, updated_at, created_by, updated_by, deleted_at"
    };
}

macro_rules! plugin_columns {
    () => {
        "id, uuid, tenant_id, organization_id, owner_user_id, plugin_key, name, description, name_locales_json, description_locales_json, icon_url, usage_count, is_featured, featured_order, featured_title_locales_json, featured_description_locales_json, featured_image_url, \
         category_id, category_code, version_label, provider, implementation_type, visibility, \
         manifest_json, source_json, marketplace_metadata_json, install_status, lifecycle_status, tags_json, \
         allowed_role_codes_json, version, created_at, updated_at, created_by, updated_by, \
         deleted_at, \
         catalog_provider, catalog_url, catalog_page_url, owner_login, npm_package, tarball_url, \
         repository_url, repository_path, repository_ref, registry_version, added_on, stars_count, \
         stars_checked_at, downloads_count, downloads_start, downloads_end, downloads_checked_at, \
         is_deprecated, replaced_by_catalog_url, catalog_revision"
    };
}

const CATEGORY_SELECT: &str = category_columns!();

const PLUGIN_SELECT: &str = plugin_columns!();

/// Keyword predicate for one plugin page: the placeholder holds the nullable
/// `%kw%` pattern, folded once by the caller.
macro_rules! plugin_keyword_predicate {
    ($keyword:literal) => {
        concat!(
            "(",
            $keyword,
            "::text IS NULL OR LOWER(plugin_key) LIKE ",
            $keyword,
            " OR LOWER(name) LIKE ",
            $keyword,
            " OR LOWER(COALESCE(description, '')) LIKE ",
            $keyword,
            " OR LOWER(name_locales_json::text) LIKE ",
            $keyword,
            " OR LOWER(description_locales_json::text) LIKE ",
            $keyword,
            " OR LOWER(COALESCE(category_code, '')) LIKE ",
            $keyword,
            " OR LOWER(tags_json::text) LIKE ",
            $keyword,
            ")"
        )
    };
}

/// Keyword predicate for one category page: the placeholder holds the nullable
/// `%kw%` pattern, folded once by the caller.
macro_rules! category_keyword_predicate {
    ($keyword:literal) => {
        concat!(
            "(",
            $keyword,
            "::text IS NULL OR LOWER(name) LIKE ",
            $keyword,
            " OR LOWER(category_code) LIKE ",
            $keyword,
            " OR LOWER(COALESCE(description, '')) LIKE ",
            $keyword,
            " OR LOWER(name_locales_json::text) LIKE ",
            $keyword,
            " OR LOWER(description_locales_json::text) LIKE ",
            $keyword,
            ")"
        )
    };
}

/// Category half of the catalog view: the placeholder holds the nullable
/// selector.
macro_rules! category_code_predicate {
    ($selector:literal) => {
        concat!(
            "(",
            $selector,
            "::text IS NULL OR LOWER(category_code) = ",
            $selector,
            ")"
        )
    };
}

/// Role half of the catalog view: the placeholder holds the caller's role
/// codes.
///
/// An empty scope keeps the all-data view, an empty assignment is open to every
/// role, and a populated scope matches the records naming one of its codes.
macro_rules! plugin_role_predicate {
    ($roles:literal) => {
        concat!(
            "(cardinality(",
            $roles,
            "::text[]) = 0 OR jsonb_array_length(allowed_role_codes_json) = 0 \
             OR allowed_role_codes_json ?| ",
            $roles,
            "::text[])"
        )
    };
}

/// Catalog access scope: the first placeholder is the caller's organization
/// scope and the second the caller's user id.
///
/// `tenant`/`public` rows are visible to every caller of the tenant,
/// `organization` rows only when their `organization_id` equals the caller's
/// scope (`0` is the tenant-level sentinel, so a tenant filed at `0` matches
/// the default no-organization caller), and `private` rows only to their
/// owner. The admin inventory deliberately does not apply this predicate.
macro_rules! plugin_scope_predicate {
    ($organization:literal, $user:literal) => {
        concat!(
            "(visibility IN ('tenant', 'public') \
             OR (visibility = 'organization' AND organization_id = ",
            $organization,
            "::bigint) \
             OR (visibility = 'private' AND owner_user_id = ",
            $user,
            "::bigint))"
        )
    };
}

/// Admin plugin page: one statement whose window count comes from the same
/// filtered set the page is cut from. Admin listings are tenant-wide and keep
/// no catalog visibility scope.
const PLUGIN_PAGE_SQL_ADMIN: &str = concat!(
    "SELECT ",
    plugin_columns!(),
    ", COUNT(*) OVER() AS __list_total FROM ai_plugin WHERE tenant_id = $1 AND ",
    active_entity_filter!(),
    " AND ",
    plugin_keyword_predicate!("$2"),
    " AND ",
    category_code_predicate!("$3"),
    " AND ",
    plugin_role_predicate!("$4"),
    " ORDER BY updated_at DESC, plugin_key ASC LIMIT $5 OFFSET $6"
);

/// Catalog plugin page: the marketplace reads only `active` rows, inside the
/// caller's visibility scope, and its window count therefore never includes
/// admin-only or out-of-scope rows. Bind order: tenant, organization, user,
/// keyword, category, roles, limit, offset.
const PLUGIN_PAGE_SQL_CATALOG: &str = concat!(
    "SELECT ",
    plugin_columns!(),
    ", COUNT(*) OVER() AS __list_total FROM ai_plugin WHERE tenant_id = $1 AND ",
    catalog_visible_filter!(),
    " AND ",
    plugin_scope_predicate!("$2", "$3"),
    " AND ",
    plugin_keyword_predicate!("$4"),
    " AND ",
    category_code_predicate!("$5"),
    " AND ",
    plugin_role_predicate!("$6"),
    " AND ($7 = FALSE OR is_featured = TRUE) ORDER BY CASE WHEN $7 = TRUE THEN featured_order END ASC NULLS LAST, CASE WHEN $7 = TRUE OR $8 = 'usage_count_desc' THEN usage_count END DESC NULLS LAST, CASE WHEN $7 = TRUE OR $8 = 'usage_count_desc' THEN NULL ELSE updated_at END DESC NULLS LAST, plugin_key ASC LIMIT $9 OFFSET $10"
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
    category_keyword_predicate!("$2"),
    " AND ",
    category_code_predicate!("$3"),
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
    category_keyword_predicate!("$2"),
    " AND ",
    category_code_predicate!("$3"),
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

/// Reads an optional `DATE` column as an ISO `YYYY-MM-DD` string.
fn optional_date_column(
    row: &sqlx::postgres::PgRow,
    field: &str,
) -> PluginsResult<Option<String>> {
    let value = row
        .try_get::<Option<chrono::NaiveDate>, _>(field)
        .map_err(map_sqlx)?;
    Ok(value.map(|date| date.format("%Y-%m-%d").to_string()))
}

/// Reads an optional `TIMESTAMPTZ` column as an RFC 3339 string.
fn optional_timestamp_column(
    row: &sqlx::postgres::PgRow,
    field: &str,
) -> PluginsResult<Option<String>> {
    let value = row
        .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>(field)
        .map_err(map_sqlx)?;
    Ok(value.map(timestamp_to_rfc3339))
}

/// Parses the wire `YYYY-MM-DD` form back into the SQL `DATE` type.
fn parse_date(value: Option<&String>, field: &str) -> PluginsResult<Option<chrono::NaiveDate>> {
    match value.map(|text| text.trim()).filter(|text| !text.is_empty()) {
        None => Ok(None),
        Some(text) => chrono::NaiveDate::parse_from_str(text, "%Y-%m-%d")
            .map(Some)
            .map_err(|error| {
                PluginsServiceError::InvalidArgument(format!(
                    "{field} must be an ISO date (YYYY-MM-DD): {error}"
                ))
            }),
    }
}

/// Parses the wire RFC 3339 form back into the SQL `TIMESTAMPTZ` type.
fn parse_timestamp(
    value: Option<&String>,
    field: &str,
) -> PluginsResult<Option<chrono::DateTime<chrono::Utc>>> {
    match value.map(|text| text.trim()).filter(|text| !text.is_empty()) {
        None => Ok(None),
        Some(text) => chrono::DateTime::parse_from_rfc3339(text)
            .map(|timestamp| Some(timestamp.with_timezone(&chrono::Utc)))
            .map_err(|error| {
                PluginsServiceError::InvalidArgument(format!(
                    "{field} must be an RFC 3339 timestamp: {error}"
                ))
            }),
    }
}

/// Normalized catalog provider written by the create path; the column keeps
/// its `sdkwork` default and rejects an empty string.
fn catalog_provider_value(record: &PluginRecord) -> &str {
    let provider = record.catalog_provider.trim();
    if provider.is_empty() {
        "sdkwork"
    } else {
        provider
    }
}

/// Child collections of a batch of plugins, keyed by plugin id.
#[derive(Default)]
struct PluginChildren {
    install_targets: HashMap<i64, Vec<PluginInstallTarget>>,
    media: HashMap<i64, Vec<PluginMedia>>,
    capabilities: HashMap<i64, Vec<String>>,
    capability_red_lines: HashMap<i64, Vec<String>>,
}

/// Batched child reads for one page of plugins: one statement per child table
/// with `plugin_id = ANY($2)`, so a page costs three round trips instead of
/// three per record.
async fn load_plugin_children(
    pool: &PgPool,
    tenant_id: u64,
    plugin_ids: &[i64],
) -> PluginsResult<PluginChildren> {
    let mut children = PluginChildren::default();

    let target_rows = sqlx::query(
        "SELECT plugin_id, target_kind, target_spec, package_name, package_version, is_default \
         FROM ai_plugin_install_target \
         WHERE tenant_id = $1 AND plugin_id = ANY($2) AND deleted_at IS NULL \
         ORDER BY plugin_id ASC, source_priority ASC, target_kind ASC, target_spec ASC",
    )
    .bind(tenant_id as i64)
    .bind(plugin_ids)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx)?;
    for row in &target_rows {
        let plugin_id: i64 = row.try_get("plugin_id").map_err(map_sqlx)?;
        children
            .install_targets
            .entry(plugin_id)
            .or_default()
            .push(PluginInstallTarget {
                kind: row.try_get("target_kind").map_err(map_sqlx)?,
                spec: row.try_get("target_spec").map_err(map_sqlx)?,
                package_name: row.try_get("package_name").map_err(map_sqlx)?,
                package_version: row.try_get("package_version").map_err(map_sqlx)?,
                is_default: row.try_get("is_default").map_err(map_sqlx)?,
            });
    }

    let media_rows = sqlx::query(
        "SELECT plugin_id, media_kind, url, sort_order \
         FROM ai_plugin_media \
         WHERE tenant_id = $1 AND plugin_id = ANY($2) AND deleted_at IS NULL \
         ORDER BY plugin_id ASC, media_kind ASC, sort_order ASC",
    )
    .bind(tenant_id as i64)
    .bind(plugin_ids)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx)?;
    for row in &media_rows {
        let plugin_id: i64 = row.try_get("plugin_id").map_err(map_sqlx)?;
        children.media.entry(plugin_id).or_default().push(PluginMedia {
            kind: row.try_get("media_kind").map_err(map_sqlx)?,
            url: row.try_get("url").map_err(map_sqlx)?,
            sort_order: row.try_get("sort_order").map_err(map_sqlx)?,
        });
    }

    let capability_rows = sqlx::query(
        "SELECT plugin_id, disclosure_kind, capability_code \
         FROM ai_plugin_capability \
         WHERE tenant_id = $1 AND plugin_id = ANY($2) AND deleted_at IS NULL \
         ORDER BY plugin_id ASC, disclosure_kind ASC, sort_order ASC, capability_code ASC",
    )
    .bind(tenant_id as i64)
    .bind(plugin_ids)
    .fetch_all(pool)
    .await
    .map_err(map_sqlx)?;
    for row in &capability_rows {
        let plugin_id: i64 = row.try_get("plugin_id").map_err(map_sqlx)?;
        let disclosure_kind: String = row.try_get("disclosure_kind").map_err(map_sqlx)?;
        let code: String = row.try_get("capability_code").map_err(map_sqlx)?;
        if disclosure_kind == "red_line" {
            children
                .capability_red_lines
                .entry(plugin_id)
                .or_default()
                .push(code);
        } else {
            children
                .capabilities
                .entry(plugin_id)
                .or_default()
                .push(code);
        }
    }

    Ok(children)
}

/// Maps the batched child rows back onto their plugin records. A plugin
/// without a stored default target keeps `install_target: None`, which is what
/// makes the service fall back to metadata derivation for legacy rows.
fn apply_plugin_children(records: &mut [PluginRecord], mut children: PluginChildren) {
    for record in records.iter_mut() {
        if let Some(targets) = children.install_targets.remove(&record.id) {
            record.install_target = targets.iter().find(|target| target.is_default).cloned();
            record.install_targets = targets;
        }
        if let Some(media) = children.media.remove(&record.id) {
            record.media = media;
        }
        if let Some(capabilities) = children.capabilities.remove(&record.id) {
            record.capabilities = capabilities;
        }
        if let Some(red_lines) = children.capability_red_lines.remove(&record.id) {
            record.capability_red_lines = red_lines;
        }
    }
}

async fn hydrate_plugin_children(
    pool: &PgPool,
    tenant_id: u64,
    records: &mut [PluginRecord],
) -> PluginsResult<()> {
    if records.is_empty() {
        return Ok(());
    }
    let plugin_ids = records.iter().map(|record| record.id).collect::<Vec<_>>();
    let children = load_plugin_children(pool, tenant_id, &plugin_ids).await?;
    apply_plugin_children(records, children);
    Ok(())
}

fn row_to_category(row: &sqlx::postgres::PgRow) -> PluginsResult<PluginCategoryRecord> {
    Ok(PluginCategoryRecord {
        id: row.try_get::<i64, _>("id").map_err(map_sqlx)?,
        uuid: row.try_get("uuid").map_err(map_sqlx)?,
        category_code: row.try_get("category_code").map_err(map_sqlx)?,
        name: row.try_get("name").map_err(map_sqlx)?,
        description: row.try_get("description").map_err(map_sqlx)?,
        name_locales: row.try_get("name_locales_json").map_err(map_sqlx)?,
        description_locales: row.try_get("description_locales_json").map_err(map_sqlx)?,
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
        organization_id: row.try_get::<i64, _>("organization_id").map_err(map_sqlx)? as u64,
        owner_user_id: row.try_get::<i64, _>("owner_user_id").map_err(map_sqlx)? as u64,
        plugin_key: row.try_get("plugin_key").map_err(map_sqlx)?,
        name: row.try_get("name").map_err(map_sqlx)?,
        description: row.try_get("description").map_err(map_sqlx)?,
        name_locales: row.try_get("name_locales_json").map_err(map_sqlx)?,
        description_locales: row.try_get("description_locales_json").map_err(map_sqlx)?,
        icon_url: row.try_get("icon_url").map_err(map_sqlx)?,
        usage_count: row
            .try_get::<i64, _>("usage_count")
            .map_err(map_sqlx)?
            .max(0) as u64,
        featured: row.try_get("is_featured").map_err(map_sqlx)?,
        featured_order: row.try_get("featured_order").map_err(map_sqlx)?,
        featured_title_locales: row
            .try_get("featured_title_locales_json")
            .map_err(map_sqlx)?,
        featured_description_locales: row
            .try_get("featured_description_locales_json")
            .map_err(map_sqlx)?,
        featured_image_url: row.try_get("featured_image_url").map_err(map_sqlx)?,
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
        marketplace_metadata: decode_marketplace_metadata(row)?,
        catalog_provider: row.try_get("catalog_provider").map_err(map_sqlx)?,
        catalog_url: row.try_get("catalog_url").map_err(map_sqlx)?,
        catalog_page_url: row.try_get("catalog_page_url").map_err(map_sqlx)?,
        owner_login: row.try_get("owner_login").map_err(map_sqlx)?,
        npm_package: row.try_get("npm_package").map_err(map_sqlx)?,
        tarball_url: row.try_get("tarball_url").map_err(map_sqlx)?,
        repository_url: row.try_get("repository_url").map_err(map_sqlx)?,
        repository_path: row.try_get("repository_path").map_err(map_sqlx)?,
        repository_ref: row.try_get("repository_ref").map_err(map_sqlx)?,
        registry_version: row.try_get("registry_version").map_err(map_sqlx)?,
        added_on: optional_date_column(row, "added_on")?,
        stars_count: row
            .try_get::<i64, _>("stars_count")
            .map_err(map_sqlx)?
            .max(0) as u64,
        stars_checked_at: optional_timestamp_column(row, "stars_checked_at")?,
        downloads_count: row
            .try_get::<i64, _>("downloads_count")
            .map_err(map_sqlx)?
            .max(0) as u64,
        downloads_start: optional_date_column(row, "downloads_start")?,
        downloads_end: optional_date_column(row, "downloads_end")?,
        downloads_checked_at: optional_timestamp_column(row, "downloads_checked_at")?,
        is_deprecated: row.try_get("is_deprecated").map_err(map_sqlx)?,
        replaced_by_catalog_url: row
            .try_get("replaced_by_catalog_url")
            .map_err(map_sqlx)?,
        catalog_revision: row.try_get("catalog_revision").map_err(map_sqlx)?,
        // Child collections are hydrated in one batched read per page by
        // `hydrate_plugin_children`; a single row decode starts empty.
        install_target: None,
        install_targets: Vec::new(),
        media: Vec::new(),
        capabilities: Vec::new(),
        capability_red_lines: Vec::new(),
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

/// Reads the curated registry projection of one plugin.
///
/// `marketplace_metadata_json` stores the upstream registry entry verbatim, so
/// a shape this build cannot read (an unknown number encoding, a truncated
/// import) is a data-quality signal about one catalog row — never a reason to
/// fail the page that carries it. The plugin still lists with
/// `marketplace_metadata = None` and the rejection is reported here.
fn decode_marketplace_metadata(
    row: &sqlx::postgres::PgRow,
) -> PluginsResult<Option<PluginMarketplaceMetadata>> {
    let Some(value) = row
        .try_get::<Option<serde_json::Value>, _>("marketplace_metadata_json")
        .map_err(map_sqlx)?
    else {
        return Ok(None);
    };
    match serde_json::from_value(value) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) => {
            let plugin_key = row
                .try_get::<String, _>("plugin_key")
                .unwrap_or_else(|_| "<unknown>".to_string());
            tracing::warn!(
                plugin_key = %plugin_key,
                error = %error,
                "stored marketplace metadata is not a readable projection; the plugin is listed without it"
            );
            Ok(None)
        }
    }
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
            id, uuid, tenant_id, category_code, name, description, name_locales_json,
            description_locales_json, sort_order,
            lifecycle_status, version, created_by, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (tenant_id, category_code) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            name_locales_json = EXCLUDED.name_locales_json,
            description_locales_json = EXCLUDED.description_locales_json,
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
        .bind(record.name_locales.clone())
        .bind(record.description_locales.clone())
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
    let mut records = rows
        .iter()
        .map(row_to_plugin)
        .collect::<PluginsResult<Vec<_>>>()?;
    hydrate_plugin_children(pool, tenant_id, &mut records).await?;
    Ok(records)
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
    let (mut items, mut total) = page(rows, row_to_plugin)?;
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
    hydrate_plugin_children(pool, tenant_id, &mut items).await?;
    Ok((items, total))
}

/// Catalog-visible plugins: only `active` rows inside the caller's visibility
/// scope, with featured placement and usage ordering.
///
/// Draft, disabled and archived plugins stay admin-only through
/// [`ACTIVE_ENTITY_FILTER`] on [`list_plugins`], and a plugin is listed only
/// when its visibility admits the caller: `tenant`/`public` for everyone,
/// `organization` for its own organization (`0` is the tenant-level sentinel)
/// and `private` for its owner.
pub async fn list_catalog_plugins(
    pool: &PgPool,
    tenant_id: u64,
    organization_id: u64,
    user_id: u64,
) -> PluginsResult<Vec<PluginRecord>> {
    let scope = plugin_scope_predicate!("$2", "$3");
    let query = format!(
        r#"
        SELECT {PLUGIN_SELECT}
        FROM ai_plugin
        WHERE tenant_id = $1 AND {CATALOG_VISIBLE_FILTER}
          AND {scope}
        ORDER BY updated_at DESC, plugin_key ASC
        "#
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(organization_id as i64)
        .bind(user_id as i64)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    let mut records = rows
        .iter()
        .map(row_to_plugin)
        .collect::<PluginsResult<Vec<_>>>()?;
    hydrate_plugin_children(pool, tenant_id, &mut records).await?;
    Ok(records)
}

/// Catalog plugin page: the total counts only the visible, filtered rows.
pub async fn list_catalog_plugins_page(
    pool: &PgPool,
    tenant_id: u64,
    organization_id: u64,
    user_id: u64,
    filter: &CatalogViewFilter,
    featured_only: bool,
    sort: PluginCatalogSort,
    keyword: Option<&str>,
    limit: i64,
    offset: i64,
) -> PluginsResult<(Vec<PluginRecord>, i64)> {
    let rows = sqlx::query(PLUGIN_PAGE_SQL_CATALOG)
        .bind(tenant_id as i64)
        .bind(organization_id as i64)
        .bind(user_id as i64)
        .bind(keyword_pattern(keyword))
        .bind(filter.category_code())
        .bind(filter.role_codes().to_vec())
        .bind(featured_only)
        .bind(match sort {
            PluginCatalogSort::UpdatedAtDesc => "updated_at_desc",
            PluginCatalogSort::UsageCountDesc => "usage_count_desc",
        })
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await
        .map_err(map_sqlx)?;
    let (mut items, mut total) = page(rows, row_to_plugin)?;
    if items.is_empty() && offset > 0 {
        total = sqlx::query(PLUGIN_PAGE_SQL_CATALOG)
            .bind(tenant_id as i64)
            .bind(organization_id as i64)
            .bind(user_id as i64)
            .bind(keyword_pattern(keyword))
            .bind(filter.category_code())
            .bind(filter.role_codes().to_vec())
            .bind(featured_only)
            .bind(match sort {
                PluginCatalogSort::UpdatedAtDesc => "updated_at_desc",
                PluginCatalogSort::UsageCountDesc => "usage_count_desc",
            })
            .bind(1_i64)
            .bind(0_i64)
            .fetch_optional(pool)
            .await
            .map_err(map_sqlx)?
            .and_then(|row| row.try_get::<i64, _>(LIST_TOTAL_SQL_COLUMN).ok())
            .unwrap_or(0);
    }
    hydrate_plugin_children(pool, tenant_id, &mut items).await?;
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
    let Some(mut record) = row.as_ref().map(row_to_plugin).transpose()? else {
        return Err(PluginsServiceError::NotFound(plugin_key.to_string()));
    };
    hydrate_plugin_children(pool, tenant_id, std::slice::from_mut(&mut record)).await?;
    Ok(record)
}

/// Catalog plugin by key: the row must be `active` and inside the caller's
/// visibility scope, so a hidden plugin is indistinguishable from a missing
/// one on the marketplace surface.
pub async fn get_catalog_plugin(
    pool: &PgPool,
    tenant_id: u64,
    organization_id: u64,
    user_id: u64,
    plugin_key: &str,
) -> PluginsResult<Option<PluginRecord>> {
    let scope = plugin_scope_predicate!("$3", "$4");
    let query = format!(
        r#"
        SELECT {PLUGIN_SELECT}
        FROM ai_plugin
        WHERE tenant_id = $1 AND plugin_key = $2 AND {CATALOG_VISIBLE_FILTER}
          AND {scope}
        LIMIT 1
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(tenant_id as i64)
        .bind(plugin_key)
        .bind(organization_id as i64)
        .bind(user_id as i64)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    let Some(mut record) = row.as_ref().map(row_to_plugin).transpose()? else {
        return Ok(None);
    };
    hydrate_plugin_children(pool, tenant_id, std::slice::from_mut(&mut record)).await?;
    Ok(Some(record))
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
    let marketplace_metadata_json = record
        .marketplace_metadata
        .as_ref()
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| {
            PluginsServiceError::Repository(format!("encode marketplace_metadata_json failed: {error}"))
        })?;
    let query = format!(
        r#"
        INSERT INTO ai_plugin (
            id, uuid, tenant_id, organization_id, owner_user_id, plugin_key, name, description,
            name_locales_json, description_locales_json, icon_url, is_featured, featured_order,
            featured_title_locales_json, featured_description_locales_json, featured_image_url,
            category_id, category_code, version_label, provider, implementation_type, visibility,
            manifest_json, source_json, marketplace_metadata_json, install_status, lifecycle_status, tags_json,
            allowed_role_codes_json, version, created_by, updated_by,
            catalog_provider, catalog_url, catalog_page_url, owner_login, npm_package, tarball_url,
            repository_url, repository_path, repository_ref, registry_version, added_on, stars_count,
            stars_checked_at, downloads_count, downloads_start, downloads_end, downloads_checked_at,
            is_deprecated, replaced_by_catalog_url, catalog_revision
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35,
            $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52
        )
        RETURNING {PLUGIN_SELECT}
        "#
    );
    let row = sqlx::query(sqlx::AssertSqlSafe(query.as_str()))
        .bind(id)
        .bind(uuid)
        .bind(tenant_id as i64)
        .bind(record.organization_id as i64)
        .bind(record.owner_user_id as i64)
        .bind(&record.plugin_key)
        .bind(&record.name)
        .bind(&record.description)
        .bind(record.name_locales.clone())
        .bind(record.description_locales.clone())
        .bind(&record.icon_url)
        .bind(record.featured)
        .bind(record.featured_order)
        .bind(record.featured_title_locales.clone())
        .bind(record.featured_description_locales.clone())
        .bind(&record.featured_image_url)
        .bind(record.category_id)
        .bind(&record.category_code)
        .bind(&record.version_label)
        .bind(&record.provider)
        .bind(record.implementation_type.as_str())
        .bind(record.visibility.as_str())
        .bind(record.manifest.clone())
        .bind(source_json)
        .bind(marketplace_metadata_json)
        .bind(record.install_status.as_str())
        .bind(record.lifecycle_status.as_db_code())
        .bind(tags_json)
        .bind(role_codes_json)
        .bind(record.version)
        .bind(operator_id as i64)
        .bind(operator_id as i64)
        // An admin-created plugin is not a catalog row: the catalog columns
        // keep their defaults and the child tables stay untouched.
        .bind(catalog_provider_value(&record).to_string())
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<String>)
        .bind(None::<chrono::NaiveDate>)
        .bind(0_i64)
        .bind(None::<chrono::DateTime<chrono::Utc>>)
        .bind(0_i64)
        .bind(None::<chrono::NaiveDate>)
        .bind(None::<chrono::NaiveDate>)
        .bind(None::<chrono::DateTime<chrono::Utc>>)
        .bind(false)
        .bind(None::<String>)
        .bind(None::<String>)
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
    let marketplace_metadata_json = record
        .marketplace_metadata
        .as_ref()
        .map(serde_json::to_value)
        .transpose()
        .map_err(|error| {
            PluginsServiceError::Repository(format!("encode marketplace_metadata_json failed: {error}"))
        })?;
    let query = format!(
        r#"
        UPDATE ai_plugin SET
            name = $3,
            description = $4,
            name_locales_json = $5,
            description_locales_json = $6,
            icon_url = $7,
            is_featured = $8,
            featured_order = $9,
            featured_title_locales_json = $10,
            featured_description_locales_json = $11,
            featured_image_url = $12,
            category_id = $13,
            category_code = $14,
            version_label = $15,
            provider = $16,
            implementation_type = $17,
            visibility = $18,
            manifest_json = $19,
            source_json = $20,
            marketplace_metadata_json = $21,
            install_status = $22,
            lifecycle_status = $23,
            tags_json = $24,
            allowed_role_codes_json = $25,
            organization_id = $26,
            owner_user_id = $27,
            version = ai_plugin.version + 1,
            updated_by = $28,
            catalog_provider = $29,
            catalog_url = $30,
            catalog_page_url = $31,
            owner_login = $32,
            npm_package = $33,
            tarball_url = $34,
            repository_url = $35,
            repository_path = $36,
            repository_ref = $37,
            registry_version = $38,
            added_on = $39,
            stars_count = $40,
            stars_checked_at = $41,
            downloads_count = $42,
            downloads_start = $43,
            downloads_end = $44,
            downloads_checked_at = $45,
            is_deprecated = $46,
            replaced_by_catalog_url = $47,
            catalog_revision = $48,
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
        .bind(record.name_locales.clone())
        .bind(record.description_locales.clone())
        .bind(&record.icon_url)
        .bind(record.featured)
        .bind(record.featured_order)
        .bind(record.featured_title_locales.clone())
        .bind(record.featured_description_locales.clone())
        .bind(&record.featured_image_url)
        .bind(record.category_id)
        .bind(&record.category_code)
        .bind(&record.version_label)
        .bind(&record.provider)
        .bind(record.implementation_type.as_str())
        .bind(record.visibility.as_str())
        .bind(record.manifest.clone())
        .bind(source_json)
        .bind(marketplace_metadata_json)
        .bind(record.install_status.as_str())
        .bind(record.lifecycle_status.as_db_code())
        .bind(tags_json)
        .bind(role_codes_json)
        .bind(record.organization_id as i64)
        .bind(record.owner_user_id as i64)
        .bind(operator_id as i64)
        // The record carries the stored catalog facts, so an admin edit
        // rewrites them unchanged; a record built without them falls back to
        // the column default/NULL instead of clearing a catalog row silently.
        .bind(catalog_provider_value(&record).to_string())
        .bind(&record.catalog_url)
        .bind(&record.catalog_page_url)
        .bind(&record.owner_login)
        .bind(&record.npm_package)
        .bind(&record.tarball_url)
        .bind(&record.repository_url)
        .bind(&record.repository_path)
        .bind(&record.repository_ref)
        .bind(&record.registry_version)
        .bind(parse_date(record.added_on.as_ref(), "addedOn")?)
        .bind(i64::try_from(record.stars_count).unwrap_or(i64::MAX))
        .bind(parse_timestamp(
            record.stars_checked_at.as_ref(),
            "starsCheckedAt",
        )?)
        .bind(i64::try_from(record.downloads_count).unwrap_or(i64::MAX))
        .bind(parse_date(record.downloads_start.as_ref(), "downloadsStart")?)
        .bind(parse_date(record.downloads_end.as_ref(), "downloadsEnd")?)
        .bind(parse_timestamp(
            record.downloads_checked_at.as_ref(),
            "downloadsCheckedAt",
        )?)
        .bind(record.is_deprecated)
        .bind(&record.replaced_by_catalog_url)
        .bind(&record.catalog_revision)
        .fetch_optional(pool)
        .await
        .map_err(map_sqlx)?;
    let Some(mut updated) = row.as_ref().map(row_to_plugin).transpose()? else {
        return Err(PluginsServiceError::NotFound(plugin_key.to_string()));
    };
    hydrate_plugin_children(pool, tenant_id, std::slice::from_mut(&mut updated)).await?;
    Ok(updated)
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
        let admin_plugin_sql = PLUGIN_PAGE_SQL_ADMIN;
        assert!(admin_plugin_sql.contains("COUNT(*) OVER()"));
        assert!(admin_plugin_sql.contains(LIST_TOTAL_SQL_COLUMN));
        assert!(admin_plugin_sql.contains("LIMIT $5 OFFSET $6"));
        assert!(admin_plugin_sql.contains(plugin_keyword_predicate!("$2")));
        assert!(admin_plugin_sql.contains(category_code_predicate!("$3")));
        assert!(admin_plugin_sql.contains(plugin_role_predicate!("$4")));

        let catalog_plugin_sql = PLUGIN_PAGE_SQL_CATALOG;
        assert!(catalog_plugin_sql.contains("COUNT(*) OVER()"));
        assert!(catalog_plugin_sql.contains(LIST_TOTAL_SQL_COLUMN));
        assert!(catalog_plugin_sql.contains("LIMIT $9 OFFSET $10"));
        assert!(catalog_plugin_sql.contains(plugin_keyword_predicate!("$4")));
        assert!(catalog_plugin_sql.contains("LOWER(name_locales_json::text) LIKE $4"));
        assert!(catalog_plugin_sql.contains("LOWER(description_locales_json::text) LIKE $4"));
        assert!(catalog_plugin_sql.contains(category_code_predicate!("$5")));
        assert!(catalog_plugin_sql.contains(plugin_role_predicate!("$6")));
        assert!(catalog_plugin_sql.contains("$8 = 'usage_count_desc'"));
        assert!(
            catalog_plugin_sql
                .contains("CASE WHEN $7 = TRUE THEN featured_order END ASC NULLS LAST")
        );
        assert!(catalog_plugin_sql.contains(
            "CASE WHEN $7 = TRUE OR $8 = 'usage_count_desc' THEN usage_count END DESC NULLS LAST"
        ));
        assert!(catalog_plugin_sql.contains("THEN usage_count END DESC NULLS LAST"));
        assert!(catalog_plugin_sql.contains("THEN NULL ELSE updated_at END DESC NULLS LAST"));
        assert!(catalog_plugin_sql.ends_with("LIMIT $9 OFFSET $10"));

        for sql in [CATEGORY_PAGE_SQL_ADMIN, CATEGORY_PAGE_SQL_CATALOG] {
            assert!(sql.contains("COUNT(*) OVER()"));
            assert!(sql.contains(LIST_TOTAL_SQL_COLUMN));
            assert!(sql.contains("LIMIT $4 OFFSET $5"));
            assert!(sql.contains(category_keyword_predicate!("$2")));
            assert!(sql.contains(category_code_predicate!("$3")));
            // Categories carry no role list, so no role predicate is applied.
            assert!(!sql.contains("allowed_role_codes_json"));
        }
    }

    #[test]
    fn catalog_pages_apply_the_visibility_scope_and_admin_pages_do_not() {
        let scope = plugin_scope_predicate!("$2", "$3");
        assert!(
            PLUGIN_PAGE_SQL_CATALOG.contains(scope),
            "catalog page must scope every read to the caller"
        );
        // Three branches: tenant/public open to every caller, organization
        // pinned to the caller's organization, private pinned to the owner.
        assert!(scope.contains("visibility IN ('tenant', 'public')"));
        assert!(scope.contains("visibility = 'organization' AND organization_id = $2::bigint"));
        assert!(scope.contains("visibility = 'private' AND owner_user_id = $3::bigint"));

        // The admin inventory stays tenant-wide: no visibility scope at all.
        assert!(!PLUGIN_PAGE_SQL_ADMIN.contains(scope));
        assert!(!PLUGIN_PAGE_SQL_ADMIN.contains("visibility IN"));
        assert!(!PLUGIN_PAGE_SQL_ADMIN.contains("::bigint"));
    }
}
