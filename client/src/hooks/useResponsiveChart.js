import { useEffect, useRef, useState } from "react";

export default function useResponsiveChart(debounceMs = 300) {
  const containerRef = useRef(null);
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    let debounceTimeout = null;
    let previousWidth = null;

    const resizeObserver = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      // A chart or loading spinner changing height is not a layout resize.
      // Remounting for those changes starts another resize/loading cycle.
      if (width <= 0) { previousWidth = 0; return; }
      if (width === previousWidth) return;
      const initialMeasurement = previousWidth === null;
      previousWidth = width;
      if (initialMeasurement) return;
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        setChartKey((prev) => prev + 1);
      }, debounceMs); // wait before triggering re-render
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(debounceTimeout);
      resizeObserver.disconnect();
    };
  }, [debounceMs]);

  return { containerRef, chartKey };
}
