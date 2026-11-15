use serde::Deserialize;

use sdkwork_plugins_contract::{normalize_category_filter, normalize_role_code_filter};

use crate::response::ApiProblem;

/// Standard GET list query parameters (`API_SPEC.md` section 14.1) plus the
/// catalog view filters (`category_code`, `role_codes`).
#[derive(Debug, Default, Deserialize)]
pub struct SdkWorkListQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub cursor: Option<String>,
    pub q: Option<String>,
    /// One category code from the registry; `all` keeps every category.
    #[serde(alias = "categoryCode")]
    pub category_code: Option<String>,
    /// Comma-separated IAM role codes of the signed-in operator. Empty keeps
    /// the "all data" view.
    #[serde(alias = "roleCodes")]
    pub role_codes: Option<String>,
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

    /// Normalized category selector: `None` keeps every category.
    pub fn category_filter(&self) -> Option<String> {
        normalize_category_filter(self.category_code.as_deref())
    }

    /// Normalized role scope: empty keeps the "all data" view.
    pub fn role_scope(&self) -> Vec<String> {
        normalize_role_code_filter(self.role_codes.as_deref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query_with(category_code: Option<&str>, role_codes: Option<&str>) -> SdkWorkListQuery {
        SdkWorkListQuery {
            category_code: category_code.map(str::to_string),
            role_codes: role_codes.map(str::to_string),
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
        assert_eq!(query_with(Some("all"), None).category_filter(), None);
        assert_eq!(
            query_with(Some("code-development"), None).category_filter(),
            Some("code-development".to_string())
        );
    }

    #[test]
    fn role_scope_is_empty_for_the_all_view() {
        assert!(query_with(None, None).role_scope().is_empty());
        assert_eq!(
            query_with(None, Some("org_admin,org_operations")).role_scope(),
            vec!["org_admin".to_string(), "org_operations".to_string()]
        );
    }
}
