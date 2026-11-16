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

        let oversized = SdkWorkListQuery {
            page_size: Some(500),
            ..Default::default()
        };
        assert_eq!(oversized.effective_page_size(), 200);
    }

    #[test]
    fn search_keyword_trims_blank_values() {
        let query = SdkWorkListQuery {
            q: Some("  ping  ".into()),
            ..Default::default()
        };
        assert_eq!(query.search_keyword(), Some("ping"));

        let blank = SdkWorkListQuery {
            q: Some("   ".into()),
            ..Default::default()
        };
        assert_eq!(blank.search_keyword(), None);
    }

    #[test]
    fn catalog_filter_keeps_all_data_and_narrows_by_category() {
        let all_data = query_with(None, None).catalog_filter();
        assert!(all_data.is_all_data());
        assert!(all_data.allows(Some("data-retrieval"), &[]));
        assert!(all_data.allows(Some("image-processing"), &[]));

        let by_category = query_with(Some("image-processing"), None).catalog_filter();
        assert_eq!(by_category.category_code(), Some("image-processing"));
        assert!(by_category.allows(Some("image-processing"), &[]));
        assert!(!by_category.allows(Some("data-retrieval"), &[]));

        let all_selector = query_with(Some("all"), None).catalog_filter();
        assert!(all_selector.is_all_data());
        assert!(all_selector.allows(Some("data-retrieval"), &[]));
        assert!(all_selector.allows(Some("image-processing"), &[]));
    }

    #[test]
    fn catalog_filter_keeps_open_records_plus_the_named_role() {
        let auditor = ["org_auditor".to_string()];
        let finance = ["org_finance".to_string()];

        let operator = query_with(None, Some("org_auditor")).catalog_filter();
        assert_eq!(
            operator.role_codes(),
            ["org_auditor".to_string()].as_slice()
        );
        assert!(operator.allows(Some("data-retrieval"), &[]));
        assert!(operator.allows(Some("document-processing"), &auditor));
        assert!(!operator.allows(Some("document-processing"), &finance));

        let composed = query_with(Some("document-processing"), Some("org_admin")).catalog_filter();
        assert!(!composed.allows(Some("document-processing"), &auditor));
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
