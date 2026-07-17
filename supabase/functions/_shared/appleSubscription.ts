// Maps decoded Apple StoreKit data to rows of the shared `subscriptions` table
// (ADR-028 / TASK-344). Used by both apple-notifications (server-to-server
// notifications) and sync-apple-purchase (client-posted transactions) so the
// row shape and status logic stay identical across the two entry points.

// The `subscriptions.status` values the app already understands. Only 'active'
// and 'trialing' grant Pro (see SubscriptionContext.hasActiveSubscription);
// everything else reads as Free while keeping an audit trail of why.
export type SubStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "refunded";

export interface AppleTransaction {
  appAccountToken?: string;
  originalTransactionId?: string;
  productId?: string;
  expiresDate?: number; // ms since epoch
  type?: string;
}

// Derive status from the notification type/subtype. Apple's renewal-info and
// transaction data disambiguate the terminal states.
// https://developer.apple.com/documentation/appstoreservernotifications/notificationtype
export function statusFromNotification(
  notificationType: string,
  subtype: string | undefined,
  txn: AppleTransaction,
): SubStatus {
  const expired = typeof txn.expiresDate === "number" && txn.expiresDate <= Date.now();

  switch (notificationType) {
    case "SUBSCRIBED": // INITIAL_BUY | RESUBSCRIBE
    case "DID_RENEW":
    case "DID_CHANGE_RENEWAL_PREF": // upgrade/downgrade/crossgrade — still active
    case "DID_CHANGE_RENEWAL_STATUS": // auto-renew toggled — access unchanged now
    case "OFFER_REDEEMED":
      return expired ? "expired" : "active";
    case "DID_FAIL_TO_RENEW":
      // In a billing-retry grace period the user keeps access; otherwise it's over.
      return subtype === "GRACE_PERIOD" ? "past_due" : "expired";
    case "GRACE_PERIOD_EXPIRED":
    case "EXPIRED":
      return "expired";
    case "REFUND":
      return "refunded";
    case "REVOKE": // family-sharing access revoked
      return "canceled";
    default:
      // Unmapped/informational types don't change entitlement.
      return expired ? "expired" : "active";
  }
}

// Build the subscriptions upsert payload for an Apple row. `userId` comes from
// the transaction's appAccountToken (which the client set to the Supabase user
// id at purchase time). Returns null when the transaction can't be mapped to a
// user, so callers can skip-and-log rather than write an orphan row.
export function appleSubscriptionRow(
  txn: AppleTransaction,
  status: SubStatus,
  renewalInfo?: { autoRenewStatus?: number },
): Record<string, unknown> | null {
  const userId = txn.appAccountToken;
  const originalTransactionId = txn.originalTransactionId;
  if (!userId || !originalTransactionId) return null;

  return {
    user_id: userId,
    provider: "apple",
    apple_original_transaction_id: originalTransactionId,
    status,
    price_id: txn.productId ?? null,
    current_period_end: txn.expiresDate
      ? new Date(txn.expiresDate).toISOString()
      : null,
    cancel_at_period_end: renewalInfo
      ? renewalInfo.autoRenewStatus === 0
      : false,
    updated_at: new Date().toISOString(),
  };
}
