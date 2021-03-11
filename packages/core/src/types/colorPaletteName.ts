// A bit awkward: these definitions are "really" in @withorbit/ui, but we don't want @withorbit/core to depend on @withorbit/ui. So we define just the names as a type here, and use a type constraint to make sure that the definitions in @withorbit/ui don't differ from this.
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
