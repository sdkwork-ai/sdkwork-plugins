//! Shared contracts for the SDKWork Plugins domain (plugin categories and
//! managed plugins with install lifecycle).
//!
//! Wire contract notes (`API_SPEC.md` section 13.6): every int64 wire field is
//! a decimal string. Records therefore use
//! `sdkwork_utils_rust::serde_int64` / `::option` on id fields, and camelCase
//! JSON property names per the plugins OpenAPI authorities.

pub mod enums;
pub mod operations;
pub mod permissions;
pub mod records;

pub use enums::*;
pub use operations::*;
pub use permissions::*;
pub use records::*;
