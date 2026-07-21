//! Provider-neutral subscription state machine.
//!
//! Stripe webhooks are adapters into these transitions; health ciphertext is
//! intentionally absent from every type in this module.

use serde::{Deserialize, Serialize};

pub const GRACE_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const LAPSE_RETENTION_SECONDS: i64 = 365 * 24 * 60 * 60;
pub const FINAL_WARNING_LEAD_SECONDS: i64 = 7 * 24 * 60 * 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntitlementStatus {
    Free,
    Active,
    Grace,
    Paused,
    Lapsed,
    Refunded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubscriptionLifecycle {
    pub status: EntitlementStatus,
    pub current_period_ends_at: Option<i64>,
    pub grace_ends_at: Option<i64>,
    pub scheduled_deletion_at: Option<i64>,
    pub first_warning_due: bool,
    pub final_warning_due: bool,
}

impl Default for SubscriptionLifecycle {
    fn default() -> Self {
        Self {
            status: EntitlementStatus::Free,
            current_period_ends_at: None,
            grace_ends_at: None,
            scheduled_deletion_at: None,
            first_warning_due: false,
            final_warning_due: false,
        }
    }
}

impl SubscriptionLifecycle {
    pub fn activate(&mut self, period_end: i64) {
        self.status = EntitlementStatus::Active;
        self.current_period_ends_at = Some(period_end);
        self.grace_ends_at = None;
        self.scheduled_deletion_at = None;
        self.first_warning_due = false;
        self.final_warning_due = false;
    }

    pub fn payment_failed(&mut self, now: i64) {
        self.status = EntitlementStatus::Grace;
        self.grace_ends_at = Some(now.saturating_add(GRACE_SECONDS));
    }

    pub fn refund(&mut self, now: i64) {
        self.status = EntitlementStatus::Refunded;
        self.grace_ends_at = None;
        self.scheduled_deletion_at = Some(now.saturating_add(LAPSE_RETENTION_SECONDS));
        self.first_warning_due = true;
    }

    pub fn advance(&mut self, now: i64) {
        if self.status == EntitlementStatus::Grace
            && self.grace_ends_at.is_some_and(|deadline| now >= deadline)
        {
            self.status = EntitlementStatus::Paused;
            self.scheduled_deletion_at = Some(now.saturating_add(LAPSE_RETENTION_SECONDS));
            self.first_warning_due = true;
        }
        if self.status == EntitlementStatus::Paused
            && self
                .scheduled_deletion_at
                .is_some_and(|deadline| now >= deadline.saturating_sub(FINAL_WARNING_LEAD_SECONDS))
        {
            self.status = EntitlementStatus::Lapsed;
            self.final_warning_due = true;
        }
    }

    pub fn deletion_due(&self, now: i64) -> bool {
        matches!(
            self.status,
            EntitlementStatus::Paused | EntitlementStatus::Lapsed | EntitlementStatus::Refunded
        ) && self
            .scheduled_deletion_at
            .is_some_and(|deadline| now >= deadline)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulated_purchase_lapse_warning_retention_and_recovery_lifecycle() {
        let mut lifecycle = SubscriptionLifecycle::default();
        lifecycle.activate(1_000);
        assert_eq!(lifecycle.status, EntitlementStatus::Active);

        lifecycle.payment_failed(1_000);
        assert_eq!(lifecycle.status, EntitlementStatus::Grace);
        lifecycle.advance(1_000 + GRACE_SECONDS - 1);
        assert_eq!(lifecycle.status, EntitlementStatus::Grace);
        lifecycle.advance(1_000 + GRACE_SECONDS);
        assert_eq!(lifecycle.status, EntitlementStatus::Paused);
        assert!(lifecycle.first_warning_due);

        let deletion = lifecycle.scheduled_deletion_at.unwrap();
        lifecycle.advance(deletion - FINAL_WARNING_LEAD_SECONDS);
        assert_eq!(lifecycle.status, EntitlementStatus::Lapsed);
        assert!(lifecycle.final_warning_due);
        assert!(!lifecycle.deletion_due(deletion - 1));
        assert!(lifecycle.deletion_due(deletion));

        lifecycle.activate(deletion + 30 * 24 * 60 * 60);
        assert_eq!(lifecycle.status, EntitlementStatus::Active);
        assert_eq!(lifecycle.scheduled_deletion_at, None);
    }

    #[test]
    fn refund_schedules_but_never_immediately_executes_deletion() {
        let mut lifecycle = SubscriptionLifecycle::default();
        lifecycle.activate(50);
        lifecycle.refund(10);
        assert_eq!(lifecycle.status, EntitlementStatus::Refunded);
        assert!(!lifecycle.deletion_due(10));
        assert!(lifecycle.deletion_due(10 + LAPSE_RETENTION_SECONDS));
    }
}
