use sdkwork_plugins_contract::{
    normalize_allowed_role_codes, PluginArtifactSource, PluginCategoryRecord,
    PluginImplementationType, PluginInstallStatus, PluginLifecycleStatus, PluginRecord,
    PluginVisibility,
};
use sdkwork_utils_rust::{is_blank, trim};

use crate::commands::{CreatePluginCommand, UpdatePluginCommand, UpsertPluginCategoryCommand};
use crate::{PluginsResult, PluginsServiceError};

const ENTITY_KEY_PATTERN: &str = r"^[a-z0-9][a-z0-9_-]{1,127}$";
const ROLE_CODE_PATTERN: &str = r"^[a-z][a-z0-9_.-]{0,127}$";
const SHA256_PATTERN: &str = r"^[0-9a-f]{64}$";
const GIT_REPOSITORY_URL_PATTERN: &str =
    r"^https://[A-Za-z0-9][A-Za-z0-9.-]*(?::[0-9]{1,5})?/[^\s]+$";
const GIT_REF_PATTERN: &str = r"^[A-Za-z0-9._/-]+$";
const DEFAULT_VERSION_LABEL: &str = "0.0.1";
const MAX_ROLE_CODES: usize = 64;
const MAX_TAGS: usize = 64;
const MAX_TAG_LENGTH: usize = 64;

pub fn validate_category_code(category_code: &str) -> PluginsResult<()> {
    validate_entity_key(category_code, "category_code")
}

pub fn validate_plugin_key(plugin_key: &str) -> PluginsResult<()> {
    validate_entity_key(plugin_key, "plugin_key")
}

pub fn validate_entity_key(value: &str, field: &str) -> PluginsResult<()> {
    let normalized = trim(value);
    let valid = regex_lite::Regex::new(ENTITY_KEY_PATTERN)
        .map_err(|error| PluginsServiceError::Repository(error.to_string()))?
        .is_match(&normalized);
    if !valid {
        return Err(PluginsServiceError::InvalidArgument(format!(
            "{field} must match {ENTITY_KEY_PATTERN}: {value}"
        )));
    }
    Ok(())
}

fn require_name(name: &str, field: &str) -> PluginsResult<()> {
    if is_blank(Some(trim(name).as_str())) {
        return Err(PluginsServiceError::InvalidArgument(format!(
            "{field} must not be empty"
        )));
    }
    Ok(())
}

fn validate_manifest(manifest: &serde_json::Value) -> PluginsResult<()> {
    if !manifest.is_object() {
        return Err(PluginsServiceError::InvalidArgument(
            "manifest must be a json object".to_string(),
        ));
    }
    Ok(())
}

fn validate_tags(tags: &[String]) -> PluginsResult<()> {
    if tags.len() > MAX_TAGS {
        return Err(PluginsServiceError::InvalidArgument(
            "tags cannot contain more than 64 entries".to_string(),
        ));
    }
    for tag in tags {
        let normalized = trim(tag);
        if normalized.is_empty() {
            return Err(PluginsServiceError::InvalidArgument(
                "tags must not contain empty entries".to_string(),
            ));
        }
        if normalized.len() > MAX_TAG_LENGTH {
            return Err(PluginsServiceError::InvalidArgument(format!(
                "tag must be at most {MAX_TAG_LENGTH} characters: {tag}"
            )));
        }
    }
    Ok(())
}

fn validate_role_codes(role_codes: &[String]) -> PluginsResult<()> {
    if role_codes.len() > MAX_ROLE_CODES {
        return Err(PluginsServiceError::InvalidArgument(
            "allowed_role_codes cannot contain more than 64 entries".to_string(),
        ));
    }
    let role_code_pattern = regex_lite::Regex::new(ROLE_CODE_PATTERN)
        .map_err(|error| PluginsServiceError::Repository(error.to_string()))?;
    for code in role_codes {
        if !role_code_pattern.is_match(&trim(code)) {
            return Err(PluginsServiceError::InvalidArgument(format!(
                "invalid allowed role code: {code}"
            )));
        }
    }
    Ok(())
}

fn validate_drive_uri(drive_uri: &str) -> PluginsResult<()> {
    let drive_uri_pattern = regex_lite::Regex::new(r"^drive://spaces/[^/]+/nodes/[^/]+$")
        .map_err(|error| PluginsServiceError::Repository(error.to_string()))?;
    if !drive_uri_pattern.is_match(&trim(drive_uri)) {
        return Err(PluginsServiceError::InvalidArgument(
            "drive_uri must be drive://spaces/{spaceId}/nodes/{nodeId}".to_string(),
        ));
    }
    Ok(())
}

fn validate_artifact_source(source: &PluginArtifactSource) -> PluginsResult<()> {
    match source {
        PluginArtifactSource::DriveFile {
            drive_uri,
            checksum_sha256,
            ..
        } => {
            validate_drive_uri(drive_uri)?;
            let checksum_pattern = regex_lite::Regex::new(SHA256_PATTERN)
                .map_err(|error| PluginsServiceError::Repository(error.to_string()))?;
            if !checksum_pattern.is_match(checksum_sha256) {
                return Err(PluginsServiceError::InvalidArgument(
                    "checksum_sha256 must be 64 lowercase hexadecimal characters".to_string(),
                ));
            }
        }
        PluginArtifactSource::DriveDirectory { drive_uri } => {
            validate_drive_uri(drive_uri)?;
        }
        PluginArtifactSource::Git {
            repository_url,
            repository_path,
            git_ref,
        } => {
            let url_pattern = regex_lite::Regex::new(GIT_REPOSITORY_URL_PATTERN)
                .map_err(|error| PluginsServiceError::Repository(error.to_string()))?;
            let normalized_url = trim(repository_url);
            if normalized_url.len() > 2048 || !url_pattern.is_match(&normalized_url) {
                return Err(PluginsServiceError::InvalidArgument(
                    "repository_url must be an absolute https URL without credentials".to_string(),
                ));
            }
            let normalized_path = trim(repository_path);
            if normalized_path.is_empty() || normalized_path.len() > 1024 {
                return Err(PluginsServiceError::InvalidArgument(
                    "repository_path must contain 1 to 1024 characters".to_string(),
                ));
            }
            if normalized_path.starts_with('/')
                || normalized_path.contains('\\')
                || normalized_path.chars().any(char::is_control)
            {
                return Err(PluginsServiceError::InvalidArgument(
                    "repository_path must be a relative POSIX path".to_string(),
                ));
            }
            if normalized_path != "." {
                for segment in normalized_path.split('/') {
                    if segment.is_empty() || segment == "." || segment == ".." {
                        return Err(PluginsServiceError::InvalidArgument(
                            "repository_path must not contain empty, '.', or '..' segments"
                                .to_string(),
                        ));
                    }
                }
            }
            if let Some(value) = git_ref {
                let normalized_ref = trim(value);
                let ref_pattern = regex_lite::Regex::new(GIT_REF_PATTERN)
                    .map_err(|error| PluginsServiceError::Repository(error.to_string()))?;
                if normalized_ref.is_empty()
                    || normalized_ref.len() > 255
                    || !ref_pattern.is_match(&normalized_ref)
                    || normalized_ref == "@"
                    || normalized_ref.contains("..")
                    || normalized_ref.starts_with('/')
                    || normalized_ref.ends_with('/')
                    || normalized_ref.contains("//")
                {
                    return Err(PluginsServiceError::InvalidArgument(
                        "git_ref must be a safe branch, tag, or commit id".to_string(),
                    ));
                }
            }
        }
    }
    Ok(())
}

pub fn validate_category_record(record: &PluginCategoryRecord) -> PluginsResult<()> {
    validate_category_code(record.category_code.as_str())?;
    require_name(record.name.as_str(), "category name")
}

pub fn validate_plugin_record(record: &PluginRecord) -> PluginsResult<()> {
    validate_plugin_key(record.plugin_key.as_str())?;
    require_name(record.name.as_str(), "name")?;
    if is_blank(Some(trim(record.version_label.as_str()).as_str())) {
        return Err(PluginsServiceError::InvalidArgument(
            "version_label must not be empty".to_string(),
        ));
    }
    validate_manifest(&record.manifest)?;
    if let Some(source) = record.source.as_ref() {
        validate_artifact_source(source)?;
    }
    validate_tags(&record.tags)?;
    validate_role_codes(&record.allowed_role_codes)?;
    validate_implementation_type(record.implementation_type)?;
    validate_visibility(record.visibility)?;
    validate_install_status(record.install_status)?;
    validate_lifecycle_status(record.lifecycle_status)?;
    Ok(())
}

pub fn validate_implementation_type(kind: PluginImplementationType) -> PluginsResult<()> {
    match kind {
        PluginImplementationType::SdkworkNative
        | PluginImplementationType::RigRust
        | PluginImplementationType::OpenaiAgents
        | PluginImplementationType::Langchain
        | PluginImplementationType::Langgraph
        | PluginImplementationType::Crewai
        | PluginImplementationType::Autogen
        | PluginImplementationType::SemanticKernel
        | PluginImplementationType::Custom => Ok(()),
    }
}

pub fn validate_visibility(visibility: PluginVisibility) -> PluginsResult<()> {
    match visibility {
        PluginVisibility::Private
        | PluginVisibility::Organization
        | PluginVisibility::Tenant
        | PluginVisibility::Public => Ok(()),
    }
}

pub fn validate_install_status(status: PluginInstallStatus) -> PluginsResult<()> {
    match status {
        PluginInstallStatus::Available
        | PluginInstallStatus::Installed
        | PluginInstallStatus::Disabled => Ok(()),
    }
}

pub fn validate_lifecycle_status(status: PluginLifecycleStatus) -> PluginsResult<()> {
    match status {
        PluginLifecycleStatus::Draft
        | PluginLifecycleStatus::Active
        | PluginLifecycleStatus::Disabled
        | PluginLifecycleStatus::Archived => Ok(()),
        PluginLifecycleStatus::Deleted => Err(PluginsServiceError::InvalidArgument(
            "lifecycle_status cannot be set to deleted through the write API".to_string(),
        )),
    }
}

pub fn category_record_from_command(
    _tenant_id: u64,
    operator_id: u64,
    command: &UpsertPluginCategoryCommand,
) -> PluginsResult<PluginCategoryRecord> {
    let record = PluginCategoryRecord {
        id: 0,
        uuid: String::new(),
        category_code: trim(command.category_code.as_str()),
        name: trim(command.name.as_str()),
        description: command.description.clone(),
        sort_order: command.sort_order.unwrap_or(0),
        lifecycle_status: PluginLifecycleStatus::Active,
        version: 0,
        created_at: String::new(),
        updated_at: String::new(),
    };
    validate_category_record(&record)?;
    let _ = operator_id;
    Ok(record)
}

pub fn plugin_record_from_create(
    _tenant_id: u64,
    operator_id: u64,
    command: &CreatePluginCommand,
) -> PluginsResult<PluginRecord> {
    let record = PluginRecord {
        id: 0,
        uuid: String::new(),
        plugin_key: trim(command.plugin_key.as_str()),
        name: trim(command.name.as_str()),
        description: command.description.clone(),
        category_id: command.category_id,
        category_code: command
            .category_code
            .as_deref()
            .map(trim)
            .filter(|value| !value.is_empty()),
        version_label: command
            .version_label
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_VERSION_LABEL)
            .to_string(),
        provider: command
            .provider
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        implementation_type: command.implementation_type,
        visibility: command.visibility.unwrap_or(PluginVisibility::Tenant),
        manifest: command
            .manifest
            .clone()
            .unwrap_or_else(|| serde_json::json!({})),
        source: command.source.clone(),
        install_status: PluginInstallStatus::Available,
        tags: normalize_tags(&command.tags),
        allowed_role_codes: normalize_allowed_role_codes(&command.allowed_role_codes),
        lifecycle_status: PluginLifecycleStatus::Active,
        version: 0,
        created_at: String::new(),
        updated_at: String::new(),
    };
    validate_plugin_record(&record)?;
    let _ = operator_id;
    Ok(record)
}

pub fn validate_update_command(command: &UpdatePluginCommand) -> PluginsResult<()> {
    if let Some(name) = command.name.as_deref() {
        require_name(name, "name")?;
    }
    if let Some(manifest) = command.manifest.as_ref() {
        validate_manifest(manifest)?;
    }
    if let Some(source) = command.source.as_ref() {
        validate_artifact_source(source)?;
    }
    if let Some(tags) = command.tags.as_ref() {
        validate_tags(tags)?;
    }
    if let Some(role_codes) = command.allowed_role_codes.as_ref() {
        validate_role_codes(role_codes)?;
    }
    if let Some(status) = command.lifecycle_status {
        validate_lifecycle_status(status)?;
    }
    Ok(())
}

/// Applies a validated partial update onto the stored record.
pub fn apply_update(record: &mut PluginRecord, command: &UpdatePluginCommand) {
    if let Some(value) = command.name.as_deref() {
        record.name = trim(value);
    }
    if let Some(value) = command.description.as_ref() {
        record.description = Some(value.clone());
    }
    if let Some(value) = command.category_id {
        record.category_id = Some(value);
    }
    if let Some(value) = command.category_code.as_deref() {
        let normalized = trim(value);
        record.category_code = if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        };
    }
    if let Some(value) = command.version_label.as_deref() {
        let normalized = value.trim();
        if !normalized.is_empty() {
            record.version_label = normalized.to_string();
        }
    }
    if let Some(value) = command.provider.as_deref() {
        let normalized = value.trim();
        record.provider = if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        };
    }
    if let Some(value) = command.implementation_type {
        record.implementation_type = value;
    }
    if let Some(value) = command.visibility {
        record.visibility = value;
    }
    if let Some(value) = command.manifest.as_ref() {
        record.manifest = value.clone();
    }
    if let Some(value) = command.source.as_ref() {
        record.source = Some(value.clone());
    }
    if let Some(value) = command.install_status {
        record.install_status = value;
    }
    if let Some(value) = command.tags.as_ref() {
        record.tags = normalize_tags(value);
    }
    if let Some(value) = command.allowed_role_codes.as_ref() {
        record.allowed_role_codes = normalize_allowed_role_codes(value);
    }
    if let Some(value) = command.lifecycle_status {
        record.lifecycle_status = value;
    }
}

fn normalize_tags(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|value| trim(value))
        .filter(|value| !value.is_empty())
        .collect()
}
