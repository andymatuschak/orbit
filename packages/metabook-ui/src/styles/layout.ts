export const borderRadius = 8;
export const gridUnit = 8;

export const spacing = {
  spacing01: gridUnit * 0.125,
  spacing02: gridUnit * 0.25,
  spacing03: gridUnit * 0.5,
  spacing04: gridUnit * 0.75,
  spacing05: gridUnit,
  spacing06: gridUnit * 1.5,
  spacing07: gridUnit * 2,
  spacing08: gridUnit * 2.5,
  spacing09: gridUnit * 3,
};

const baseColumnWidth = 166;
export const columnMargin = gridUnit;

export function getColumnSpan(columnCount: number, columnWidth: number) {
  if (columnCount < 1) {
    throw new Error(`Can't get column span for column count of ${columnCount}`);
  }
  return Math.round(
    columnCount * columnWidth + (columnCount - 1) * columnMargin,
  );
}

export interface ColumnLayout {
  columnCount: number;
  columnWidth: number;
  edgeMargin: number;
}

export function getColumnLayout(width: number): ColumnLayout {
  const edgeMargin =
    // width >= baseColumnWidth * 2 + columnMargin + gridUnit * 4
    width >= baseColumnWidth + gridUnit * 4 ? gridUnit * 2 : gridUnit;
  const interiorWidth = width - edgeMargin * 2;
  const columnCount = Math.floor(
    (interiorWidth + columnMargin) / (baseColumnWidth + columnMargin),
  );
  return {
    columnCount,
    columnWidth:
      (interiorWidth - columnMargin * (columnCount - 1)) / columnCount,
    edgeMargin,
  };
}
