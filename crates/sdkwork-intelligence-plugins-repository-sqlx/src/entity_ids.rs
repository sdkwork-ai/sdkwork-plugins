use std::time::Duration;

use sdkwork_id_core::{SnowflakeIdError, SnowflakeIdGenerator};
use sdkwork_utils_rust::uuid;

/// Mints one positive snowflake id, waiting out sequence exhaustion. The
/// generator itself is owned by the database host and shared into this
/// repository through `SqlxPluginsRepository::new`.
pub fn new_plugins_snowflake_id(generator: &SnowflakeIdGenerator) -> i64 {
    loop {
        match generator.generate() {
            Ok(id) if id > 0 => return id,
            Ok(_) => continue,
            Err(SnowflakeIdError::SequenceExhausted { .. }) => {
                std::thread::sleep(Duration::from_millis(1));
            }
            Err(error) => panic!("generate plugins snowflake id failed: {error:?}"),
        }
    }
}

pub fn new_plugins_uuid() -> String {
    uuid()
}
