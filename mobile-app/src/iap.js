// StoreKit 2 in-app purchase wrapper (ADR-028 / TASK-344).
//
// Thin adapter over react-native-iap v15 (OpenIAP / Nitro API) so the rest of the
// app deals in plain promises instead of the library's event-based purchase flow.
// iOS-only: Pro is sold through Apple IAP on the phone; the website keeps Stripe.
//
// The library delivers purchase results through purchaseUpdatedListener /
// purchaseErrorListener rather than resolving requestPurchase(), so we bridge a
// single in-flight purchase to a promise. The app only ever runs one purchase at
// a time (a modal Subscribe button), so a single pending resolver is sufficient.
import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
} from 'react-native-iap';
import {
  APPLE_PRO_MONTHLY_PRODUCT_ID,
  APPLE_PRO_YEARLY_PRODUCT_ID,
} from '../shared/config';

export const PRODUCT_IDS = [
  APPLE_PRO_MONTHLY_PRODUCT_ID,
  APPLE_PRO_YEARLY_PRODUCT_ID,
].filter(Boolean);

const isIOS = Platform.OS === 'ios';

let connected = false;
let updateSub = null;
let errorSub = null;
let pending = null; // { resolve, reject } for the in-flight purchase

// react-native-iap surfaces a user cancel as one of these codes across versions.
function isUserCancel(error) {
  const code = error?.code ?? error?.responseCode;
  return code === 'E_USER_CANCELLED' || code === 'user-cancelled' || code === 2;
}

export async function initIap() {
  if (!isIOS || connected) return connected;
  await initConnection();
  updateSub = purchaseUpdatedListener((purchase) => {
    if (pending) {
      const p = pending;
      pending = null;
      p.resolve(purchase);
    }
  });
  errorSub = purchaseErrorListener((error) => {
    if (pending) {
      const p = pending;
      pending = null;
      p.reject(error);
    }
  });
  connected = true;
  return true;
}

export async function endIap() {
  updateSub?.remove?.();
  errorSub?.remove?.();
  updateSub = null;
  errorSub = null;
  if (connected) {
    await endConnection();
    connected = false;
  }
}

// Load the subscription products so the UI can show live localized pricing.
// Returns [] if IAP is unavailable or no product IDs are configured.
export async function loadProducts() {
  if (!isIOS || !PRODUCT_IDS.length) return [];
  await initIap();
  const result = await fetchProducts({ skus: PRODUCT_IDS, type: 'subs' });
  return Array.isArray(result) ? result : [];
}

// Purchase a subscription. `appAccountToken` MUST be the Supabase user id (a
// UUID) — it is how the server maps the Apple transaction back to the account
// (ADR-028). Resolves to the Purchase (whose `purchaseToken` is the iOS JWS to
// send to the server), or throws; `{ cancelled: true }` is returned on user
// cancel rather than throwing.
export async function purchaseSubscription(sku, appAccountToken) {
  if (!isIOS) throw new Error('In-app purchase is only available on iOS.');
  await initIap();
  const purchasePromise = new Promise((resolve, reject) => {
    pending = { resolve, reject };
  });
  try {
    await requestPurchase({
      request: { apple: { sku, appAccountToken } },
      type: 'subs',
    });
  } catch (error) {
    pending = null;
    if (isUserCancel(error)) return { cancelled: true };
    throw error;
  }
  try {
    return await purchasePromise;
  } catch (error) {
    if (isUserCancel(error)) return { cancelled: true };
    throw error;
  }
}

// Active/unfinished purchases for the signed-in Apple ID (powers Restore).
export async function getActivePurchases() {
  if (!isIOS) return [];
  await initIap();
  const result = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
  return Array.isArray(result) ? result : [];
}

// Remove a purchase from the queue after it has been verified server-side.
export async function finishPurchase(purchase) {
  if (!isIOS || !purchase) return;
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch {
    // Non-fatal: an unfinished transaction is re-delivered on next launch.
  }
}

// The unified purchase token — on iOS this is the StoreKit 2 transaction JWS the
// server verifies (see sync-apple-purchase / _shared/appleJws.ts).
export function jwsOf(purchase) {
  return purchase?.purchaseToken ?? null;
}
