// A bit awkward: these definitions are "really" in the app's UI module, but we don't want @withorbit/core to depend on @withorbit/app. So we define just the names as a type here, and use a type constraint to make sure that the definitions in the app's UI module don't differ from this.
export type ColorPaletteName =
  | "red"
  | "orange"
  | "brown"
  | "yellow"
  | "lime"
  | "green"
  | "turquoise"
  | "cyan"
  | "blue"
  | "violet"
  | "purple"
  | "pink";
