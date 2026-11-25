//! Serde helpers for catalog integers projected from a third-party registry.
//!
//! `API_SPEC.md` section 13.6 makes every `int64` HTTP wire field a decimal
//! string, and `sdkwork_utils_rust::serde_uint64` enforces exactly that at the
//! HTTP boundary. A curated catalog snapshot is not an HTTP payload, though:
//! it is the upstream registry entry stored verbatim in
//! `ai_plugin.marketplace_metadata_json`, where the same quantity (star count,
//! download count) is a JSON **number**.
//!
//! Deserializing that projection with the strict wire helper rejected every
//! imported row and failed the whole marketplace list with `50001`, so catalog
//! intake accepts both stored forms while the emitted wire form stays the
//! contract decimal string:
//!
//! - intake: `null`, a JSON integer, or a decimal string of digits;
//! - output: `null`, or a decimal string (`serde_uint64` compatible).
//!
//! Negative values, fractional numbers, and non-decimal text stay rejected:
//! the tolerance covers representation, never range or type.

use serde::{Deserialize, Deserializer, Serializer};

/// Serializes `Option<u64>` as the contract decimal string (`null` for none).
pub fn serialize<S>(value: &Option<u64>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    match value {
        Some(number) => serializer.collect_str(number),
        None => serializer.serialize_none(),
    }
}

/// Deserializes `null`, a JSON integer, or a decimal string into `Option<u64>`.
pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    let Some(value) = Option::<StoredInteger>::deserialize(deserializer)? else {
        return Ok(None);
    };
    value.into_u64().map(Some)
}

/// One stored catalog integer: the registry's JSON number or the wire string.
#[derive(Deserialize)]
#[serde(untagged)]
enum StoredInteger {
    Number(u64),
    Text(String),
}

impl StoredInteger {
    fn into_u64<E: serde::de::Error>(self) -> Result<u64, E> {
        match self {
            Self::Number(number) => Ok(number),
            Self::Text(text) => {
                if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
                    return Err(E::custom(format!(
                        "catalog integer must match ^[0-9]+$ (received {text:?})"
                    )));
                }
                text.parse::<u64>()
                    .map_err(|_| E::custom("catalog integer out of u64 range"))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct Wrapper {
        #[serde(default, with = "super")]
        value: Option<u64>,
    }

    #[test]
    fn accepts_the_stored_registry_number() {
        let wrapper: Wrapper = serde_json::from_str(r#"{"value":9990}"#).expect("stored number");
        assert_eq!(wrapper.value, Some(9_990));
    }

    #[test]
    fn accepts_the_contract_wire_string() {
        let wrapper: Wrapper = serde_json::from_str(r#"{"value":"9990"}"#).expect("wire string");
        assert_eq!(wrapper.value, Some(9_990));
    }

    #[test]
    fn accepts_null_and_absent() {
        let null: Wrapper = serde_json::from_str(r#"{"value":null}"#).expect("null");
        assert_eq!(null.value, None);
        let absent: Wrapper = serde_json::from_str("{}").expect("absent");
        assert_eq!(absent.value, None);
    }

    #[test]
    fn always_serializes_the_contract_wire_string() {
        let wrapped = Wrapper { value: Some(9_990) };
        assert_eq!(
            serde_json::to_string(&wrapped).expect("serialize number"),
            r#"{"value":"9990"}"#
        );
        assert_eq!(
            serde_json::to_string(&Wrapper { value: None }).expect("serialize none"),
            r#"{"value":null}"#
        );
    }

    #[test]
    fn rejects_negative_fractional_and_text_values() {
        for input in [
            r#"{"value":-1}"#,
            r#"{"value":1.5}"#,
            r#"{"value":"-1"}"#,
            r#"{"value":""}"#,
            r#"{"value":"1e3"}"#,
            r#"{"value":"18446744073709551616"}"#,
            r#"{"value":"abc"}"#,
        ] {
            assert!(
                serde_json::from_str::<Wrapper>(input).is_err(),
                "{input} must be rejected"
            );
        }
    }
}
