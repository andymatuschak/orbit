export const borderRadius = 8;
export const gridUnit = 8;

export const columnMargin = gridUnit;
export const edgeMargin = gridUnit * 2;

export const maximumContentWidth = 750;
export const maximumContentHeight = 750;

export function getColumnSpan(columnCount: number, layoutWidth: number) {
  if (columnCount < 1 || columnCount > 2) {
    throw new Error(`Can't get column span for column count of ${columnCount}`);
  }

  // Assumes a two-column layout
  const columnWidth = (layoutWidth - edgeMargin * 2 - columnMargin) / 2.0;
  return Math.round(
    columnCount * columnWidth + (columnCount - 1) * columnMargin,
  );
}

export type SizeClass = "compact" | "regular";
export function getWidthSizeClass(width: number): SizeClass {
  return width > 414 ? "regular" : "compact";
}
