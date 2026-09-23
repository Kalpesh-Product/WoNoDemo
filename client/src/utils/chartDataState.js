// Distinguish the initial empty/zero-filled query result from usable chart data.
// Remount once across this boundary so ApexCharts initializes with the loaded
// series, rather than updating an instance still rendering its empty state.
export const getChartDataState = (series = []) => {
  const hasValue = (point) => {
    const value = point && typeof point === "object" && !Array.isArray(point)
      ? point.y
      : point;
    if (Array.isArray(value)) return value.some(hasValue);
    return value !== null && value !== undefined &&
      Number.isFinite(Number(value)) && Number(value) !== 0;
  };
  return series.some((entry) =>
    Array.isArray(entry?.data) ? entry.data.some(hasValue) : hasValue(entry),
  ) ? "populated" : "empty";
};
