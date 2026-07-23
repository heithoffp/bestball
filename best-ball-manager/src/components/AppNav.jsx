/**
 * AppNav — application navigation shell.
 *
 * SideNav   (>= 900px): grouped command rail, collapsible to an icon rail.
 * MobileNav (<  900px): slim top bar + fixed 5-slot bottom dock + "More" sheet.
 *
 * Both receive the same resolved nav model from App.jsx:
 *   groups: [{ label, items: [{ key, label, icon, locked, isNew }] }]
 */
import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, HelpCircle, Lock, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import BrandLogo from './BrandLogo';
import styles from './AppNav.module.css';

const COLLAPSE_KEY = 'bbe:navCollapsed';

/* Keys pinned to the mobile dock; everything else lives in the More sheet. */
const DOCK_KEYS = ['dashboard', 'exposures', 'rosters', 'timeseries'];
const DOCK_SHORT_LABELS = { timeseries: 'ADP' };

function NavItem({ item, active, onSelect, collapsed }) {
  const Icon = item.icon;
  return (
    <button
      className={[
        styles.navItem,
        active ? styles.navItemActive : '',
        item.locked ? styles.navItemLocked : '',
      ].join(' ')}
      onClick={() => onSelect(item.key)}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      data-nav-item={item.key}
    >
      <Icon className={styles.navIcon} size={17} aria-hidden="true" />
      <span className={styles.navLabel}>{item.label}</span>
      {item.isNew && <span className={styles.pill} aria-label="New feature">New</span>}
      {item.locked && <Lock className={styles.lockIcon} size={12} aria-hidden="true" />}
    </button>
  );
}

export function SideNav({ groups, activeTab, onSelect, helpOpen, onToggleHelp, onOpenBlog, footer }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* private mode */ }
  }, [collapsed]);

  return (
    <aside
      className={`${styles.rail}${collapsed ? ` ${styles.railCollapsed}` : ''}`}
      data-nav="rail"
    >
      <div className={styles.brand}>
        <BrandLogo size={30} />
        <div className={styles.wordmark}>BEST BALL<br />EXPOSURES</div>
      </div>

      <nav className={styles.nav} aria-label="Primary">
        {groups.map((group, i) => (
          <div key={group.label ?? `group-${i}`}>
            {group.label && <div className={styles.groupLabel}>{group.label}</div>}
            {group.items.map(item => (
              <NavItem
                key={item.key}
                item={item}
                active={activeTab === item.key}
                onSelect={onSelect}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className={styles.railFooter}>
        <button
          className={styles.navItem}
          onClick={onOpenBlog}
          title={collapsed ? 'Blog' : undefined}
          aria-label="Read Against ADP — the Best Ball Exposures blog"
          data-nav-item="blog"
        >
          <BookOpen className={styles.navIcon} size={17} aria-hidden="true" />
          <span className={styles.navLabel}>Blog</span>
        </button>
        <button
          className={`${styles.navItem}${helpOpen ? ` ${styles.navItemHelp}` : ''}`}
          onClick={onToggleHelp}
          title={collapsed ? 'Help' : undefined}
          aria-label={helpOpen ? 'Close help' : 'Show help'}
          data-nav-item="help"
        >
          <HelpCircle className={styles.navIcon} size={17} aria-hidden="true" />
          <span className={styles.navLabel}>Help</span>
        </button>

        {!collapsed && footer}

        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed
            ? <PanelLeftOpen size={16} aria-hidden="true" />
            : <PanelLeftClose size={16} aria-hidden="true" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

export function MobileNav({ groups, activeTab, onSelect, helpOpen, onToggleHelp, onOpenBlog, topActions, sheetActions }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  const allItems = groups.flatMap(g => g.items);
  const dockItems = DOCK_KEYS.map(k => allItems.find(i => i.key === k)).filter(Boolean);
  const moreItems = allItems.filter(i => !DOCK_KEYS.includes(i.key));
  const moreActive = moreItems.some(i => i.key === activeTab);

  const selectAndClose = (key) => { onSelect(key); setSheetOpen(false); };

  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.topBrand}>
          <BrandLogo size={26} />
          <span className={styles.topWordmark}>BB EXPOSURES</span>
        </div>
        <div className={styles.topActions}>{topActions}</div>
      </header>

      <nav className={styles.dock} aria-label="Primary" data-nav="dock">
        {dockItems.map(item => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              className={`${styles.dockItem}${active ? ` ${styles.dockItemActive}` : ''}`}
              onClick={() => selectAndClose(item.key)}
              aria-current={active ? 'page' : undefined}
              data-nav-item={item.key}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{DOCK_SHORT_LABELS[item.key] ?? item.label}</span>
            </button>
          );
        })}
        <button
          className={`${styles.dockItem}${(moreActive || sheetOpen) ? ` ${styles.dockItemActive}` : ''}`}
          onClick={() => setSheetOpen(o => !o)}
          aria-expanded={sheetOpen}
          aria-label="More navigation options"
          data-nav-item="more"
        >
          <LayoutGrid size={20} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      {sheetOpen && (
        <div className={styles.sheetBackdrop} onClick={closeSheet}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.sheetGrid}>
              {moreItems.map(item => {
                const Icon = item.icon;
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    className={[
                      styles.sheetTile,
                      active ? styles.sheetTileActive : '',
                      item.locked ? styles.sheetTileLocked : '',
                    ].join(' ')}
                    onClick={() => selectAndClose(item.key)}
                    aria-current={active ? 'page' : undefined}
                    data-nav-item={item.key}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.isNew && !item.locked && <span className={`${styles.pill} ${styles.tilePill}`}>New</span>}
                    {item.locked && <Lock className={styles.tileLock} size={12} aria-hidden="true" />}
                  </button>
                );
              })}
              <button
                className={styles.sheetTile}
                onClick={() => { onOpenBlog(); setSheetOpen(false); }}
                data-nav-item="blog"
              >
                <BookOpen size={20} aria-hidden="true" />
                <span>Blog</span>
              </button>
              <button
                className={`${styles.sheetTile}${helpOpen ? ` ${styles.sheetTileActive}` : ''}`}
                onClick={() => { onToggleHelp(); setSheetOpen(false); }}
                data-nav-item="help"
              >
                <HelpCircle size={20} aria-hidden="true" />
                <span>Help</span>
              </button>
            </div>
            {sheetActions}
          </div>
        </div>
      )}
    </>
  );
}
