import { trackEvent } from '../utils/analytics';
import styles from './AppStoreBadge.module.css';

/** Single source of truth for the iOS app's App Store listing. */
export const APP_STORE_URL = 'https://apps.apple.com/app/best-ball-exposures/id6791977736';

/** Apple logo glyph (inline so the badge renders with zero external requests). */
export function AppleLogo({ size = 20, className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.56-1.702" />
    </svg>
  );
}

/**
 * Classic black "Download on the App Store" badge.
 * `placement` tags the analytics event so we can see which surface converts.
 */
export default function AppStoreBadge({ placement = 'unknown' }) {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.badge}
      onClick={() => trackEvent('app_store_link_clicked', { placement })}
      aria-label="Download Best Ball Exposures on the App Store"
    >
      <AppleLogo size={22} className={styles.badgeLogo} />
      <span className={styles.badgeText}>
        <span className={styles.badgeSmall}>Download on the</span>
        <span className={styles.badgeLarge}>App Store</span>
      </span>
    </a>
  );
}

/**
 * Compact rail/sheet button for signed-in users — sits alongside
 * InstallExtensionButton in the account cluster.
 */
export function IosAppButton({ show = true, placement = 'rail' }) {
  if (!show) return null;
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.railButton}
      onClick={() => trackEvent('app_store_link_clicked', { placement })}
      aria-label="Get the Best Ball Exposures iPhone app on the App Store"
    >
      <AppleLogo size={14} className={styles.railLogo} />
      Get the iPhone App
      <span className={styles.newBadge} aria-hidden="true">New</span>
    </a>
  );
}
