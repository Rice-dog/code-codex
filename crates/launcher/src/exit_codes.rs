//! Stable process exit codes shared by the console launcher and GUI wrapper.

pub const GENERIC_FAILURE: u8 = 1;
pub const UNSUPPORTED_VERSION: u8 = 20;
pub const ALREADY_RUNNING: u8 = 21;
pub const STARTUP_FAILURE: u8 = 22;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categorized_failures_are_stable_and_distinct() {
        assert_eq!(GENERIC_FAILURE, 1);
        assert_eq!(UNSUPPORTED_VERSION, 20);
        assert_eq!(ALREADY_RUNNING, 21);
        assert_eq!(STARTUP_FAILURE, 22);
    }
}
