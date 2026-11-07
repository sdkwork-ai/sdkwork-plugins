use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;

use async_trait::async_trait;

use sdkwork_plugins_contract::{PluginCategoryRecord, PluginRecord};
use sdkwork_utils_rust::uuid;

use crate::{PluginsRepository, PluginsResult, PluginsServiceError};

fn map_poison<T>(_: T) -> PluginsServiceError {
    PluginsServiceError::Repository("in-memory plugins registry lock poisoned".to_string())
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
                self.stamp_created(&mut created.created_at, &mut created.updated_at, &mut created.version);
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
        self.stamp_created(&mut created.created_at, &mut created.updated_at, &mut created.version);
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

    async fn delete_plugin(
        &self,
        tenant_id: u64,
        plugin_key: &str,
    ) -> PluginsResult<PluginRecord> {
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
}
