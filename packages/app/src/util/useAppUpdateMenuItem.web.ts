import type { MenuItemSpec } from "../ui/index.js";

/** Browser code refreshes normally; never load the native update runtime. */
export default function useAppUpdateMenuItem(_canReload: () => boolean): {
  menuItem: MenuItemSpec | null;
  writesFinished(): void;
} {
  return { menuItem: null, writesFinished() {} };
}
