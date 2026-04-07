/**
 * Reconnecting MutationObserver
 *
 * Watches a DOM target and automatically re-attaches if the target element
 * is removed (e.g., during a React re-render that replaces the root node).
 * Addresses systems model finding F-009.
 *
 * @param {Object} options
 * @param {string} options.targetSelector - CSS selector for the target element
 * @param {MutationCallback} options.onMutation - Called on observed mutations
 * @param {Function} [options.onReconnect] - Called when observer re-attaches after target loss
 * @param {number} [options.pollInterval=500] - Ms between reconnection attempts
 * @param {number} [options.maxRetries=20] - Max reconnection attempts before giving up
 * @returns {{ disconnect: () => void }} Controller with disconnect method
 */
export function createReconnectingObserver({
  targetSelector,
  onMutation,
  onReconnect,
  pollInterval = 500,
  maxRetries = 20,
}) {
  let observer = null;
  let pollTimer = null;
  let disconnected = false;

  const observerOptions = {
    childList: true,
    subtree: true,
  };

  function attach(target) {
    if (observer) observer.disconnect();
    observer = new MutationObserver(onMutation);
    observer.observe(target, observerOptions);
  }

  function tryReconnect() {
    let retries = 0;
    pollTimer = setInterval(() => {
      if (disconnected) {
        clearInterval(pollTimer);
        return;
      }

      const target = document.querySelector(targetSelector);
      if (target) {
        clearInterval(pollTimer);
        pollTimer = null;
        attach(target);
        onReconnect?.();
      } else if (++retries >= maxRetries) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }, pollInterval);
  }

  // Watch for target removal by observing the document body
  const bodyObserver = new MutationObserver(() => {
    if (disconnected) return;
    const target = document.querySelector(targetSelector);
    if (!target && observer) {
      observer.disconnect();
      observer = null;
      tryReconnect();
    }
  });

  // Initial attachment
  const initialTarget = document.querySelector(targetSelector);
  if (initialTarget) {
    attach(initialTarget);
  } else {
    tryReconnect();
  }

  bodyObserver.observe(document.body, { childList: true, subtree: true });

  return {
    disconnect() {
      disconnected = true;
      if (pollTimer) clearInterval(pollTimer);
      if (observer) observer.disconnect();
      bodyObserver.disconnect();
    },
  };
}
