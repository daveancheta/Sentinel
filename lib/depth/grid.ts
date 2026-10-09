export function at(grid: Float32Array, cols: number, r: number, c: number): number {
  if (r < 0 || r >= Math.floor(grid.length / cols) || c < 0 || c >= cols) return 0;
  return grid[r * cols + c];
}

export function regionAverage(
  grid: Float32Array,
  cols: number,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): number {
  let sum = 0;
  let count = 0;
  const rows = Math.floor(grid.length / cols);
  for (let r = Math.max(0, rowStart); r < Math.min(rows, rowEnd); r++) {
    for (let c = Math.max(0, colStart); c < Math.min(cols, colEnd); c++) {
      sum += grid[r * cols + c];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

export function rowAverage(
  grid: Float32Array,
  cols: number,
  row: number,
  colStart = 0,
  colEnd = cols,
): number {
  return regionAverage(grid, cols, row, row + 1, colStart, colEnd);
}

export function columnAverage(
  grid: Float32Array,
  cols: number,
  col: number,
  rowStart: number,
  rowEnd: number,
): number {
  return regionAverage(grid, cols, rowStart, rowEnd, col, col + 1);
}
