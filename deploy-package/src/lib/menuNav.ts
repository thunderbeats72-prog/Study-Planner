/**
 * Keyboard navigation for the task ⋮ popover menu — kept as a tiny pure
 * module so the arrow/Home/End behaviour is unit-testable and shared by
 * every menu that follows the same pattern.
 */

export const MENU_NAV_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"] as const;

export function isMenuNavKey(key: string): key is (typeof MENU_NAV_KEYS)[number] {
  return (MENU_NAV_KEYS as readonly string[]).includes(key);
}

/**
 * Index to focus after `key` is pressed while item `index` is active out of
 * `count` items. Arrow keys wrap around; Home/End jump to the ends.
 * Returns null when the key is not a menu-navigation key or the menu is empty.
 */
export function nextMenuIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return (index + 1 + count) % count;
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
