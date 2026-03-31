/**
 * Underdog Fantasy Platform Adapter
 *
 * Implements the PlatformAdapter interface for underdogfantasy.com.
 * Stub implementation — real DOM scraping logic added in TASK-044 (entries)
 * and TASK-046 (draft overlay).
 *
 * @type {import('./interface.js').PlatformAdapter}
 */
const underdogAdapter = {
  isMatch(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname === 'underdogfantasy.com' || hostname.endsWith('.underdogfantasy.com');
    } catch {
      return false;
    }
  },

  async getEntries() {
    // TASK-044: Implement entries page scraping
    throw new Error('[BBM] getEntries() not implemented — see TASK-044');
  },

  getDraftState() {
    // TASK-046: Implement live draft state reading
    throw new Error('[BBM] getDraftState() not implemented — see TASK-046');
  },

  getInjectionTarget() {
    // TASK-046: Identify stable injection point on Underdog draft pages
    return null;
  },

  getStyles() {
    // Underdog's visual style — will be refined when building the overlay (TASK-046)
    return {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
      textColor: '#e0e0e0',
      bgColor: 'rgba(30, 30, 30, 0.85)',
      borderColor: '#333',
    };
  },

  getPlayerRows() {
    // TASK-046: Query draft board player row elements
    return [];
  },
};

export default underdogAdapter;
