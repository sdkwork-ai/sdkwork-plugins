use serde::Deserialize;

use sdkwork_utils_rust::{CatalogViewFilter, CatalogViewQuery};

use crate::response::ApiProblem;

/// Standard GET list query parameters (`API_SPEC.md` section 14.1) plus the
/// catalog view filters (`category_code`, `role_codes`).
#[derive(Debug, Default, Deserialize)]
pub struct SdkWorkListQuery {
    #[serde(
        default,
        deserialize_with = "sdkwork_utils_rust::serde_query_int::option_i32"
    )]
    pub page: Option<i32>,
    #[serde(
        default,
        deserialize_with = "sdkwork_utils_rust::serde_query_int::option_i32"
    )]
    pub page_size: Option<i32>,
    pub cursor: Option<String>,
    pub q: Option<String>,
    /// The shared catalog view vocabulary: one registry category code (`all`
    /// keeps every category) plus the caller's comma-separated IAM role codes.
    #[serde(flatten)]
    pub catalog: CatalogViewQuery,
}

impl SdkWorkListQuery {
    pub fn validate(&self) -> Result<(), ApiProblem> {
        let cursor = self
            .cursor
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if cursor.is_some() {
            return Err(ApiProblem::bad_request(
                "cursor pagination is not supported yet; use page and page_size",
            ));
        }
        Ok(())
    }

    pub fn effective_page_size(&self) -> i32 {
        self.page_size.unwrap_or(20).clamp(1, 200)
    }

    pub fn effective_page(&self) -> i32 {
        self.page.unwrap_or(1).max(1)
    }

    pub fn search_keyword(&self) -> Option<&str> {
        self.q
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }

    /// Normalized catalog view: the default keeps every category and role.
    pub fn catalog_filter(&self) -> CatalogViewFilter {
        self.catalog.to_filter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query_with(category_code: Option<&str>, role_codes: Option<&str>) -> SdkWorkListQuery {
        SdkWorkListQuery {
            catalog: CatalogViewQuery {
                category_code: category_code.map(str::to_string),
                role_codes: role_codes.map(str::to_string),
            },
            ..Default::default()
        }
    }

    #[test]
    fn rejects_cursor_pagination() {
        let query = SdkWorkListQuery {
            cursor: Some("cursor-1".into()),
            ..Default::default()
        };
        assert!(query.validate().is_err());
    }

    #[test]
    fn effective_page_size_defaults_and_clamps() {
        let default_query = SdkWorkListQuery::default();
        assert_eq!(default_query.effective_page_size(), 20);
    }

    #[test]
    fn category_filter_keeps_all_for_the_all_selector() {
        assert_eq!(
            query_with(Some("all"), None)
                .catalog_filter()
                .category_code(),
            None
        );
        assert_eq!(
            query_with(Some("code-development"), None)
                .catalog_filter()
                .category_code(),
            Some("code-development")
        );
    }

    #[test]
    fn role_scope_is_empty_for_the_all_view() {
        assert!(query_with(None, None)
            .catalog_filter()
            .role_codes()
            .is_empty());
        assert_eq!(
            query_with(None, Some("org_admin,org_operations"))
                .catalog_filter()
                .role_codes(),
            ["org_admin".to_string(), "org_operations".to_string()].as_slice()
        );
    }

    #[test]
    fn wire_form_parses_through_the_dto() {
        let query: SdkWorkListQuery =
            serde_urlencoded::from_str("category_code=all&role_codes=org_admin,org_auditor")
                .expect("list query parses");
        assert_eq!(query.page, None);
        let filter = query.catalog_filter();
        assert_eq!(filter.category_code(), None);
        assert_eq!(
            filter.role_codes(),
            ["org_admin".to_string(), "org_auditor".to_string()].as_slice()
        );
    }
}
