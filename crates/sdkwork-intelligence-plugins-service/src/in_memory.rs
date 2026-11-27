use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use async_trait::async_trait;

use sdkwork_plugins_contract::{
    PluginCategoryRecord, PluginInstallationRecord, PluginLifecycleStatus, PluginRecord,
    PluginVisibility,
};
use sdkwork_utils_rust::{uuid, CatalogViewFilter};

use crate::{PluginCatalogSort, PluginsRepository, PluginsResult, PluginsServiceError};

fn map_poison<T>(_: T) -> PluginsServiceError {
    PluginsServiceError::Repository("in-memory plugins registry lock poisoned".to_string())
}

/// Whether a catalog reader may see the record. Mirrors the SQL
/// `plugin_scope_predicate`: `tenant`/`public` rows are open to every caller of
/// the tenant, `organization` rows only to their own organization (`0` is the
/// tenant-level sentinel) and `private` rows only to their owner.
fn plugin_in_scope(record: &PluginRecord, organization_id: u64, user_id: u64) -> bool {
    match record.visibility {
        PluginVisibility::Tenant | PluginVisibility::Public => true,
        PluginVisibility::Organization => record.organization_id == organization_id,
        PluginVisibility::Private => record.owner_user_id == user_id,
    }
}

fn contains_keyword(value: &str, keyword: &str) -> bool {
    value.to_lowercase().contains(keyword)
}

fn localized_values_match(values: &serde_json::Value, keyword: &str) -> bool {
    values.as_object().is_some_and(|entries| {
        entries.values().any(|value| {
            value
                .as_str()
                .is_some_and(|text| contains_keyword(text, keyword))
        })
    })
}

fn category_in_view(
    record: &PluginCategoryRecord,
    filter: &CatalogViewFilter,
    keyword: Option<&str>,
) -> bool {
    // Categories carry no role list, so the role half is the open-record case.
    if !filter.allows(Some(record.category_code.as_str()), &[]) {
        return false;
    }
    let Some(keyword) = keyword else {
        return true;
    };
    let keyword = keyword.to_lowercase();
    contains_keyword(&record.name, &keyword)
        || contains_keyword(&record.category_code, &keyword)
        || contains_keyword(record.description.as_deref().unwrap_or(""), &keyword)
        || localized_values_match(&record.name_locales, &keyword)
        || localized_values_match(&record.description_locales, &keyword)
}

fn plugin_in_view(
    record: &PluginRecord,
    filter: &CatalogViewFilter,
    keyword: Option<&str>,
) -> bool {
    if !filter.allows(record.category_code.as_deref(), &record.allowed_role_codes) {
        return false;
    }
    let Some(keyword) = keyword else {
        return true;
    };
    let keyword = keyword.to_lowercase();
    contains_keyword(&record.plugin_key, &keyword)
        || contains_keyword(&record.name, &keyword)
        || contains_keyword(record.description.as_deref().unwrap_or(""), &keyword)
        || contains_keyword(record.category_code.as_deref().unwrap_or(""), &keyword)
        || record
            .tags
            .iter()
            .any(|tag| contains_keyword(tag, &keyword))
        || localized_values_match(&record.name_locales, &keyword)
        || localized_values_match(&record.description_locales, &keyword)
}

/// Extracts one page from an already ordered, already filtered collection and
/// reports its filtered length as the total.
fn slice_page<T>(records: Vec<T>, limit: i64, offset: i64) -> (Vec<T>, i64) {
    let total = i64::try_from(records.len()).unwrap_or(i64::MAX);
    let offset = usize::try_from(offset).unwrap_or(usize::MAX);
    let limit = usize::try_from(limit).unwrap_or(0);
    let items = records.into_iter().skip(offset).take(limit).collect();
    (items, total)
}

/// Deterministic in-memory [`PluginsRepository`] for tests and local
/// development. Snowflake-free ids come from a monotonic counter so records
/// stay stable and unique within the process.
#[derive(Default)]
pub struct InMemoryPluginRepository {
    state: Mutex<InMemoryState>,
    next_id: AtomicI64,
}

#[derive(Default)]
struct InMemoryState {
    categories: HashMap<(u64, String), PluginCategoryRecord>,
    plugins: HashMap<(u64, String), PluginRecord>,
    installations: HashMap<(u64, u64, u64, String, String), PluginInstallationRecord>,
}

impl InMemoryPluginRepository {
    pub fn new() -> Self {
        Self::default()
    }

    fn allocate_id(&self) -> i64 {
        self.next_id.fetch_add(1, Ordering::SeqCst) + 1
    }

    fn stamp_created(&self, created_at: &mut String, updated_at: &mut String, version: &mut i64) {
        let id = self.allocate_id();
        let timestamp = format!("1970-01-01T00:00:{:02}Z", id % 60);
        *created_at = timestamp.clone();
        *updated_at = timestamp;
        *version = id;
    }
}

#[async_trait]
impl PluginsRepository for InMemoryPluginRepository {
    async fn list_categories(&self, tenant_id: u64) -> PluginsResult<Vec<PluginCategoryRecord>> {
        let state = self.state.lock().map_err(map_poison)?;
        let mut records: Vec<PluginCategoryRecord> = state
            .categories
            .iter()
            .filter(|((tenant, _), _)| *tenant == tenant_id)
            .map(|(_, record)| record.clone())
            .collect();
        records.sort_by(|left, right| {
            left.sort_order
                .cmp(&right.sort_order)
                .then_with(|| left.category_code.cmp(&right.category_code))
        });
        Ok(records)
    }

    async fn list_catalog_categories(
        &self,
        tenant_id: u64,
    ) -> PluginsResult<Vec<PluginCategoryRecord>> {
        let mut records = self.list_categories(tenant_id).await?;
        records.retain(|record| record.lifecycle_status == PluginLifecycleStatus::Active);
        Ok(records)
    }

    async fn list_categories_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)> {
        let records = self.list_categories(tenant_id).await?;
        let filtered = records
            .into_iter()
            .filter(|record| category_in_view(record, filter, keyword))
            .collect();
        Ok(slice_page(filtered, limit, offset))
    }

    async fn list_catalog_categories_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginCategoryRecord>, i64)> {
        let records = self.list_catalog_categories(tenant_id).await?;
        let filtered = records
            .into_iter()
            .filter(|record| category_in_view(record, filter, keyword))
            .collect();
        Ok(slice_page(filtered, limit, offset))
    }

    async fn get_category(
        &self,
        tenant_id: u64,
        category_code: &str,
    ) -> PluginsResult<PluginCategoryRecord> {
        let state = self.state.lock().map_err(map_poison)?;
        state
            .categories
            .get(&(tenant_id, category_code.to_string()))
            .cloned()
            .ok_or_else(|| PluginsServiceError::NotFound(category_code.to_string()))
    }

    async fn upsert_category(
        &self,
        tenant_id: u64,
        _operator_id: u64,
        record: PluginCategoryRecord,
    ) -> PluginsResult<PluginCategoryRecord> {
        let mut state = self.state.lock().map_err(map_poison)?;
        let key = (tenant_id, record.category_code.clone());
        let mut stored = match state.categories.get(&key) {
            Some(existing) => {
                let mut updated = record;
                updated.id = existing.id;
                updated.uuid = existing.uuid.clone();
                updated.created_at = existing.created_at.clone();
                updated.version = existing.version + 1;
                updated
            }
            None => {
                let mut created = record;
                created.id = self.allocate_id();
                created.uuid = uuid();
                self.stamp_created(
                    &mut created.created_at,
                    &mut created.updated_at,
                    &mut created.version,
                );
                created
            }
        };
        stored.updated_at = stored.created_at.clone();
        state.categories.insert(key, stored.clone());
        Ok(stored)
    }

    async fn list_plugins(&self, tenant_id: u64) -> PluginsResult<Vec<PluginRecord>> {
        let state = self.state.lock().map_err(map_poison)?;
        let mut records: Vec<PluginRecord> = state
            .plugins
            .iter()
            .filter(|((tenant, _), _)| *tenant == tenant_id)
            .map(|(_, record)| record.clone())
            .collect();
        records.sort_by(|left, right| {
            right
                .updated_at
                .cmp(&left.updated_at)
                .then_with(|| left.plugin_key.cmp(&right.plugin_key))
        });
        Ok(records)
    }

    async fn list_catalog_plugins(
        &self,
        tenant_id: u64,
        organization_id: u64,
        user_id: u64,
    ) -> PluginsResult<Vec<PluginRecord>> {
        let mut records = self.list_plugins(tenant_id).await?;
        records.retain(|record| {
            record.lifecycle_status == PluginLifecycleStatus::Active
                && plugin_in_scope(record, organization_id, user_id)
        });
        Ok(records)
    }

    async fn list_plugins_page(
        &self,
        tenant_id: u64,
        filter: &CatalogViewFilter,
        keyword: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> PluginsResult<(Vec<PluginRecord>, i64)> {
        let records = self.list_plugins(tenant_id).await?;
        let filtered = records
            .into_iter()
            .filter(|record| plugin_in_view(record, filter, keyword))
            .collect();
        Ok(slice_page(filtered, limit, offset))
    }

    async fn list_catalog_plugins_page(
        &self,
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
        let records = self
            .list_catalog_plugins(tenant_id, organization_id, user_id)
            .await?;
        let filtered = records
            .into_iter()
            .filter(|record| !featured_only || record.featured)
            .filter(|record| plugin_in_view(record, filter, keyword))
            .collect::<Vec<_>>();
        let filtered = if featured_only {
            let mut sorted = filtered;
            sorted.sort_by(|left, right| {
                left.featured_order
                    .cmp(&right.featured_order)
                    .then_with(|| right.usage_count.cmp(&left.usage_count))
                    .then_with(|| left.plugin_key.cmp(&right.plugin_key))
            });
            sorted
        } else {
            match sort {
                PluginCatalogSort::UpdatedAtDesc => filtered,
                PluginCatalogSort::UsageCountDesc => {
                    let mut sorted = filtered;
                    sorted.sort_by(|left, right| {
                        right
                            .usage_count
                            .cmp(&left.usage_count)
                            .then_with(|| left.plugin_key.cmp(&right.plugin_key))
                    });
                    sorted
                }
            }
        };
        Ok(slice_page(filtered, limit, offset))
    }

    async fn get_catalog_plugin(
        &self,
        tenant_id: u64,
        organization_id: u64,
        user_id: u64,
        plugin_key: &str,
    ) -> PluginsResult<Option<PluginRecord>> {
        let state = self.state.lock().map_err(map_poison)?;
        Ok(state
            .plugins
            .get(&(tenant_id, plugin_key.to_string()))
            .filter(|record| {
                record.lifecycle_status == PluginLifecycleStatus::Active
                    && plugin_in_scope(record, organization_id, user_id)
            })
            .cloned())
    }

    async fn get_plugin(&self, tenant_id: u64, plugin_key: &str) -> PluginsResult<PluginRecord> {
        let state = self.state.lock().map_err(map_poison)?;
        state
            .plugins
            .get(&(tenant_id, plugin_key.to_string()))
            .cloned()
            .ok_or_else(|| PluginsServiceError::NotFound(plugin_key.to_string()))
    }

    async fn create_plugin(
        &self,
        tenant_id: u64,
        _operator_id: u64,
        record: PluginRecord,
    ) -> PluginsResult<PluginRecord> {
        let mut state = self.state.lock().map_err(map_poison)?;
        let key = (tenant_id, record.plugin_key.clone());
        if state.plugins.contains_key(&key) {
            return Err(PluginsServiceError::InvalidArgument(format!(
                "plugin_key already exists: {}",
                record.plugin_key
            )));
        }
        let mut created = record;
        created.id = self.allocate_id();
        created.uuid = uuid();
        self.stamp_created(
            &mut created.created_at,
            &mut created.updated_at,
            &mut created.version,
        );
        state.plugins.insert(key, created.clone());
        Ok(created)
    }

    async fn update_plugin(
        &self,
        tenant_id: u64,
        _operator_id: u64,
        plugin_key: &str,
        record: PluginRecord,
    ) -> PluginsResult<PluginRecord> {
        let mut state = self.state.lock().map_err(map_poison)?;
        let key = (tenant_id, plugin_key.to_string());
        let Some(existing) = state.plugins.get(&key) else {
            return Err(PluginsServiceError::NotFound(plugin_key.to_string()));
        };
        let mut updated = record;
        updated.id = existing.id;
        updated.uuid = existing.uuid.clone();
        updated.created_at = existing.created_at.clone();
        updated.updated_at = existing.updated_at.clone();
        updated.version = existing.version + 1;
        state.plugins.insert(key, updated.clone());
        Ok(updated)
    }

    async fn delete_plugin(&self, tenant_id: u64, plugin_key: &str) -> PluginsResult<PluginRecord> {
        let mut state = self.state.lock().map_err(map_poison)?;
        let key = (tenant_id, plugin_key.to_string());
        let Some(existing) = state.plugins.get(&key) else {
            return Err(PluginsServiceError::NotFound(plugin_key.to_string()));
        };
        let mut deleted = existing.clone();
        deleted.lifecycle_status = sdkwork_plugins_contract::PluginLifecycleStatus::Deleted;
        state.plugins.remove(&key);
        Ok(deleted)
    }

    async fn sync_installation(
        &self,
        tenant_id: u64,
        organization_id: u64,
        user_id: u64,
        mut record: PluginInstallationRecord,
    ) -> PluginsResult<PluginInstallationRecord> {
        let mut state = self.state.lock().map_err(map_poison)?;
        let key = (
            tenant_id,
            organization_id,
            user_id,
            record.host_id.clone(),
            record.plugin_key.clone(),
        );
        if let Some(existing) = state.installations.get(&key) {
            record.id = existing.id;
        } else {
            record.id = self.allocate_id();
        }
        let id = record.id;
        record.synchronized_at = format!("1970-01-01T00:00:{:02}Z", id % 60);
        if record.status == sdkwork_plugins_contract::PluginInstallationStatus::Removed {
            record.removed_at = Some(record.synchronized_at.clone());
        } else {
            record.removed_at = None;
        }
        state.installations.insert(key, record.clone());
        Ok(record)
    }

    async fn get_installation(
        &self,
        tenant_id: u64,
        organization_id: u64,
        user_id: u64,
        host_id: &str,
        plugin_key: &str,
    ) -> PluginsResult<Option<PluginInstallationRecord>> {
        let state = self.state.lock().map_err(map_poison)?;
        Ok(state
            .installations
            .get(&(
                tenant_id,
                organization_id,
                user_id,
                host_id.to_string(),
                plugin_key.to_string(),
            ))
            .cloned())
    }
}
