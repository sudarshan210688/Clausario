// Menu catalogue (Architecture.md §8.3). Keys are stable ids stored in the menucontroller collection.
// No imports: config/env.ts validates MENU_DEFAULT_TESTER against MENU_KEYS.

export const MENU_KEYS = ['overview', 'analyze', 'runs', 'review', 'knowledge', 'settings', 'users', 'access'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export type MenuGroup = 'Workspace' | 'Governance' | 'Knowledge' | 'Administration';

export interface MenuItem {
  key: MenuKey;
  label: string;
  group: MenuGroup;
  path: string;
  /** Icon name the frontend maps to an SVG. */
  icon: string;
  order: number;
  /** Needs role Admin even when granted. */
  adminOnly: boolean;
}

export const MENU_CATALOGUE: readonly MenuItem[] = [
  { key: 'overview', label: 'Overview', group: 'Workspace', path: '/', icon: 'home', order: 10, adminOnly: false },
  { key: 'analyze', label: 'New analysis', group: 'Workspace', path: '/analyze', icon: 'flask', order: 20, adminOnly: false },
  { key: 'runs', label: 'Runs', group: 'Workspace', path: '/runs', icon: 'list', order: 30, adminOnly: false },
  { key: 'review', label: 'Review queue', group: 'Governance', path: '/review', icon: 'shield', order: 40, adminOnly: false },
  { key: 'knowledge', label: 'Knowledge base', group: 'Knowledge', path: '/knowledge', icon: 'book', order: 50, adminOnly: false },
  { key: 'settings', label: 'Engines & models', group: 'Administration', path: '/settings', icon: 'sliders', order: 60, adminOnly: false },
  { key: 'users', label: 'Users', group: 'Administration', path: '/admin/users', icon: 'users', order: 70, adminOnly: true },
  { key: 'access', label: 'Menu access', group: 'Administration', path: '/admin/access', icon: 'key', order: 80, adminOnly: true },
];

export const isMenuKey = (key: string): key is MenuKey => (MENU_KEYS as readonly string[]).includes(key);
