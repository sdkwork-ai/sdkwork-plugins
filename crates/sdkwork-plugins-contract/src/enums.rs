use serde::{Deserialize, Serialize};

/// Implementation runtime a plugin is delivered with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PluginImplementationType {
    SdkworkNative,
    RigRust,
    OpenaiAgents,
    Langchain,
    Langgraph,
    Crewai,
    Autogen,
    SemanticKernel,
    Custom,
}

impl PluginImplementationType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SdkworkNative => "sdkwork-native",
            Self::RigRust => "rig-rust",
            Self::OpenaiAgents => "openai-agents",
            Self::Langchain => "langchain",
            Self::Langgraph => "langgraph",
            Self::Crewai => "crewai",
            Self::Autogen => "autogen",
            Self::SemanticKernel => "semantic-kernel",
            Self::Custom => "custom",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "sdkwork-native" => Some(Self::SdkworkNative),
            "rig-rust" => Some(Self::RigRust),
            "openai-agents" => Some(Self::OpenaiAgents),
            "langchain" => Some(Self::Langchain),
            "langgraph" => Some(Self::Langgraph),
            "crewai" => Some(Self::Crewai),
            "autogen" => Some(Self::Autogen),
            "semantic-kernel" => Some(Self::SemanticKernel),
            "custom" => Some(Self::Custom),
            _ => None,
        }
    }
}

/// Publication scope of a plugin.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginVisibility {
    Private,
    Organization,
    Tenant,
    Public,
}

impl PluginVisibility {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Private => "private",
            Self::Organization => "organization",
            Self::Tenant => "tenant",
            Self::Public => "public",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "private" => Some(Self::Private),
            "organization" => Some(Self::Organization),
            "tenant" => Some(Self::Tenant),
            "public" => Some(Self::Public),
            _ => None,
        }
    }
}

/// Install lifecycle of a plugin in the marketplace registry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginInstallStatus {
    Available,
    Installed,
    Disabled,
}

impl PluginInstallStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Available => "available",
            Self::Installed => "installed",
            Self::Disabled => "disabled",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "available" => Some(Self::Available),
            "installed" => Some(Self::Installed),
            "disabled" => Some(Self::Disabled),
            _ => None,
        }
    }
}

/// Entity lifecycle shared by plugin categories and plugins. Persisted as a
/// smallint (`lifecycle_status`); serialized on the wire as a lowercase string.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginLifecycleStatus {
    Draft,
    Active,
    Disabled,
    Archived,
    Deleted,
}

impl PluginLifecycleStatus {
    pub fn as_db_code(self) -> i16 {
        match self {
            Self::Draft => 0,
            Self::Active => 1,
            Self::Disabled => 2,
            Self::Archived => 3,
            Self::Deleted => 4,
        }
    }

    pub fn from_db_code(value: i16) -> Option<Self> {
        match value {
            0 => Some(Self::Draft),
            1 => Some(Self::Active),
            2 => Some(Self::Disabled),
            3 => Some(Self::Archived),
            4 => Some(Self::Deleted),
            _ => None,
        }
    }
}
