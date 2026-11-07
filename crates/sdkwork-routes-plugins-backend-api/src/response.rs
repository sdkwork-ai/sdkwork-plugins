use axum::{
    http::{HeaderName, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use sdkwork_utils_rust::{PageInfo, PageMode, SdkWorkApiResponse, SdkWorkPageData, SdkWorkResourceData};
use sdkwork_web_core::{
    problem_response, WebFrameworkError, WebFrameworkErrorKind, WebRequestContext,
};
use serde::Serialize;

use crate::list_query::SdkWorkListQuery;

pub type ApiResult<T> = Result<T, ApiProblem>;

pub fn ok_json<T>(data: T) -> ApiResult<T> {
    Ok(data)
}

/// Maps service errors onto HTTP problem semantics.
impl From<sdkwork_intelligence_plugins_service::PluginsServiceError> for ApiProblem {
    fn from(error: sdkwork_intelligence_plugins_service::PluginsServiceError) -> Self {
        use sdkwork_intelligence_plugins_service::PluginsServiceError;
        match error {
            PluginsServiceError::NotFound(message) => ApiProblem::not_found(message),
            PluginsServiceError::InvalidArgument(message) => ApiProblem::bad_request(message),
            PluginsServiceError::Repository(message) => {
                ApiProblem::internal_server_error(message)
            }
        }
    }
}

pub fn paginate_items<T>(items: Vec<T>, query: &SdkWorkListQuery) -> SdkWorkPageData<T> {
    let total = items.len();
    let page_size = query.effective_page_size() as usize;
    let page = query.effective_page() as usize;
    let total_pages = if total == 0 {
        0
    } else {
        total.div_ceil(page_size) as i32
    };
    let start = (page.saturating_sub(1)).saturating_mul(page_size);
    let page_items: Vec<T> = items.into_iter().skip(start).take(page_size).collect();
    SdkWorkPageData {
        items: page_items,
        page_info: PageInfo {
            mode: PageMode::Offset,
            page: Some(page as i32),
            page_size: Some(page_size as i32),
            total_items: Some(total.to_string()),
            total_pages: Some(total_pages),
            next_cursor: None,
            has_more: Some((page * page_size) < total),
        },
    }
}

pub fn item_data<T>(item: T) -> SdkWorkResourceData<T> {
    SdkWorkResourceData { item }
}

fn success_response<T: Serialize>(
    ctx: &WebRequestContext,
    status: StatusCode,
    data: T,
) -> Result<Response, ApiProblem> {
    let trace_id = ctx.resolved_trace_id();
    let envelope = SdkWorkApiResponse::success(data, trace_id.clone());
    let mut response = (status, Json(envelope)).into_response();
    if let Ok(value) = HeaderValue::from_str(&trace_id) {
        response
            .headers_mut()
            .insert(HeaderName::from_static("x-sdkwork-trace-id"), value);
    }
    Ok(response)
}

pub fn finish_api_json<T: Serialize>(ctx: &WebRequestContext, result: ApiResult<T>) -> Response {
    match result {
        Ok(data) => success_response(ctx, StatusCode::OK, data)
            .unwrap_or_else(|problem| problem.into_response_for(ctx)),
        Err(problem) => problem.into_response_for(ctx),
    }
}

/// Created (HTTP 201) success envelope for pure create operations.
pub fn finish_created_api_json<T: Serialize>(
    ctx: &WebRequestContext,
    result: ApiResult<T>,
) -> Response {
    match result {
        Ok(data) => success_response(ctx, StatusCode::CREATED, data)
            .unwrap_or_else(|problem| problem.into_response_for(ctx)),
        Err(problem) => problem.into_response_for(ctx),
    }
}

/// HTTP 204 with no body for delete operations. A failed result maps to a
/// problem detail (404 when the target does not exist).
pub fn finish_no_content(
    ctx: &WebRequestContext,
    result: ApiResult<()>,
) -> Response {
    match result {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(problem) => problem.into_response_for(ctx),
    }
}

#[derive(Debug)]
pub struct ApiProblem {
    message: String,
    status: StatusCode,
}

impl ApiProblem {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: StatusCode::BAD_REQUEST,
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: StatusCode::NOT_FOUND,
        }
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: StatusCode::FORBIDDEN,
        }
    }

    pub fn internal_server_error(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn framework_error(&self) -> WebFrameworkError {
        let kind = match self.status {
            StatusCode::BAD_REQUEST => WebFrameworkErrorKind::BadRequest,
            StatusCode::NOT_FOUND => WebFrameworkErrorKind::NotFound,
            StatusCode::FORBIDDEN => WebFrameworkErrorKind::Forbidden,
            StatusCode::INTERNAL_SERVER_ERROR => WebFrameworkErrorKind::InternalServerError,
            _ => WebFrameworkErrorKind::InternalServerError,
        };
        WebFrameworkError {
            kind,
            message: self.message.clone(),
            retry_after_seconds: None,
            auth_profile: None,
            failed_stage: None,
            reason: None,
        }
    }

    pub fn into_response_for(self, ctx: &WebRequestContext) -> Response {
        problem_response(&self.framework_error(), ctx.problem_correlation())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::list_query::SdkWorkListQuery;

    #[test]
    fn paginate_items_returns_requested_page_slice() {
        let items: Vec<i32> = (1..=25).collect();
        let query = SdkWorkListQuery {
            page: Some(2),
            page_size: Some(10),
            ..Default::default()
        };
        let page = paginate_items(items, &query);
        assert_eq!(page.items, vec![11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
        assert_eq!(page.page_info.page, Some(2));
        assert_eq!(page.page_info.page_size, Some(10));
        assert_eq!(page.page_info.total_pages, Some(3));
        assert_eq!(page.page_info.has_more, Some(true));
    }
}
