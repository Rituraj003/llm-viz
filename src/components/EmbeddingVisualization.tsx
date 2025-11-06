import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import * as d3 from "d3";
import DetailView from "./DetailView";

const CLUSTER_NAMES: { [key: number]: string } = {
  0: "Percentage and Fraction Problems",
  1: "Multiplier and Comparison Problems",
  2: "Budgeting and Shopping Calculations",
  3: "Ratio and Proportion Scaling",
  4: "Age and Time Difference Problems",
  5: "Counting and Fractional Parts",
  6: "Chain Multiplication and Cumulative Totals",
  7: "Rate and Time Computations",
  8: "Money and Wage Calculations",
  9: "Measurement and Area Problems",
};

// --- Helper Components ---

const Tooltip: React.FC<{
  hoveredPoint: DataPoint | null;
  mousePos: { x: number; y: number };
}> = ({ hoveredPoint, mousePos }) => {
  if (!hoveredPoint) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: mousePos.x + 15,
        top: mousePos.y,
        background: "rgba(40, 40, 40, 0.9)",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        pointerEvents: "none",
        fontSize: "13px",
        zIndex: 1000,
        fontFamily: "sans-serif",
        transition: "opacity 0.2s, transform 0.2s",
        opacity: 1,
        transform: "translateY(-100%)",
      }}
    >
      <strong>{CLUSTER_NAMES[hoveredPoint.cluster]}</strong>
      <div style={{ marginTop: "4px", color: "#ccc" }}>
        Point ID: {hoveredPoint.id}
        <br />
        x: {hoveredPoint.x.toFixed(3)}
        <br />
        y: {hoveredPoint.y.toFixed(3)}
      </div>
      <div style={{ marginTop: "4px", color: "#ccc" }}>
        {hoveredPoint.question}
      </div>
    </div>
  );
};

const Legend: React.FC<{
  clusterColors: Map<number, string>;
  activeClusters: Set<number>;
  onToggleCluster: (cluster: number) => void;
}> = ({ clusterColors, activeClusters, onToggleCluster }) => {
  return (
    <>
      <h4 style={{ marginBottom: "15px", marginTop: "5px", color: "#E0E0E0" }}>
        Clusters
      </h4>
      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        {[...clusterColors.entries()]
          .sort(([a], [b]) => a - b)
          .map(([cluster, color]) => (
            <div
              key={cluster}
              onClick={() => onToggleCluster(cluster)}
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "10px",
                cursor: "pointer",
                opacity: activeClusters.has(cluster) ? 1 : 0.5,
                transition: "opacity 0.2s",
              }}
            >
              <div
                style={{
                  width: "14px",
                  height: "14px",
                  backgroundColor: color,
                  borderRadius: "50%",
                  marginRight: "10px",
                }}
              />
              <span style={{ fontSize: "14px" }}>{CLUSTER_NAMES[cluster]}</span>
            </div>
          ))}
      </div>
    </>
  );
};

// --- Main Component ---

interface DataPoint {
  x: number;
  y: number;
  cluster: number;
  id: number;
  question: string;
  isCorrect?: number; // 1 for correct, 0 for incorrect
}

const EmbeddingVisualization: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [data, setData] = useState<DataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<DataPoint | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const [activeClusters, setActiveClusters] = useState<Set<number>>(new Set());
  const [transform, setTransform] = useState(d3.zoomIdentity);
  const [selectedPointId, setSelectedPointId] = useState<number | null>(null);

  const dimensions = {
    width: 1000,
    height: 700,
    margin: { top: 50, right: 50, bottom: 50, left: 60 },
  };

  // --- Data Loading ---
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/gsm8k_embeddings_2d.json").then((res) => {
        if (!res.ok) throw new Error(`Failed to load data: ${res.statusText}`);
        return res.json();
      }),
      fetch("/gsm8k_data_with_questions.json").then((res) => {
        if (!res.ok) throw new Error(`Failed to load data: ${res.statusText}`);
        return res.json();
      }),
      fetch("/responses_all.json").then((res) => {
        if (!res.ok) throw new Error(`Failed to load data: ${res.statusText}`);
        return res.json();
      }),
    ])
      .then(
        ([embeddingData, questionData, responsesData]: [
          Omit<DataPoint, "question" | "isCorrect">[],
          { id: number; question: string }[],
          { i: number; x: number }[]
        ]) => {
          const questionMap = new Map(
            questionData.map((d) => [d.id, d.question])
          );
          const correctnessMap = new Map(
            responsesData.map((d) => [d.i, d.x])
          );
          const mergedData = embeddingData.map((d) => ({
            ...d,
            question: questionMap.get(d.id) || "",
            isCorrect: correctnessMap.get(d.id),
          }));
          setData(mergedData);
          setActiveClusters(new Set(mergedData.map((p) => p.cluster)));
          setLoading(false);
        }
      )
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // --- Memoized Scales & Data ---
  const { xScale, yScale, clusterColors, filteredData } = useMemo(() => {
    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.x) as [number, number])
      .range([
        dimensions.margin.left,
        dimensions.width - dimensions.margin.right,
      ])
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.y) as [number, number])
      .range([
        dimensions.height - dimensions.margin.bottom,
        dimensions.margin.top,
      ])
      .nice();

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    const clusterColors = new Map<number, string>();
    const clusters = [...new Set(data.map((d) => d.cluster))];
    clusters.forEach((c) => clusterColors.set(c, colorScale(String(c))));

    const filteredData = data.filter((d) => activeClusters.has(d.cluster));

    return { xScale, yScale, clusterColors, filteredData };
  }, [data, activeClusters, dimensions]);

  // --- Canvas Drawing ---
  const drawPoints = useCallback(
    (currentTransform: d3.ZoomTransform) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;

      const { width, height } = dimensions;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, height);

      filteredData.forEach((d) => {
        const cx = currentTransform.applyX(xScale(d.x));
        const cy = currentTransform.applyY(yScale(d.y));

        if (cx < 0 || cx > width || cy < 0 || cy > height) return;

        const pointColor = clusterColors.get(d.cluster) || "#999";

        // Draw checkmark or cross based on correctness (no background circle)
        if (d.isCorrect !== undefined) {
          ctx.globalAlpha = 1;
          ctx.font = "bold 12px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = pointColor; // Use cluster color
          
          if (d.isCorrect === 1) {
            // Correct - draw checkmark (✓)
            ctx.fillText("✓", cx, cy);
          } else {
            // Incorrect - draw cross (✗)
            ctx.fillText("✗", cx, cy);
          }
        }
      });

      if (hoveredPoint) {
        const cx = currentTransform.applyX(xScale(hoveredPoint.x));
        const cy = currentTransform.applyY(yScale(hoveredPoint.y));
        const hoverColor = clusterColors.get(hoveredPoint.cluster) || "#999";
        
        // Draw a highlight circle for hovered point
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.stroke();

        // Redraw the symbol larger for hovered point
        if (hoveredPoint.isCorrect !== undefined) {
          ctx.globalAlpha = 1;
          ctx.font = "bold 16px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = hoverColor; // Use cluster color
          
          if (hoveredPoint.isCorrect === 1) {
            ctx.fillText("✓", cx, cy);
          } else {
            ctx.fillText("✗", cx, cy);
          }
        }
      }
    },
    [dimensions, filteredData, hoveredPoint, xScale, yScale, clusterColors]
  );

  useEffect(() => {
    drawPoints(transform);
  }, [drawPoints, transform]);

  // --- D3 Axes & Zoom ---
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const canvas = d3.select(canvasRef.current);

    if (!svg || !canvas) return;

    // Axes
    const xAxis = d3.axisBottom(
      xScale.copy().domain(transform.rescaleX(xScale).domain())
    );
    const yAxis = d3.axisLeft(
      yScale.copy().domain(transform.rescaleY(yScale).domain())
    );

    svg.selectAll(".x-axis").remove();
    svg.selectAll(".y-axis").remove();

    svg
      .append("g")
      .attr("class", "x-axis")
      .attr(
        "transform",
        `translate(0, ${dimensions.height - dimensions.margin.bottom})`
      )
      .call(xAxis);

    svg
      .append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${dimensions.margin.left}, 0)`)
      .call(yAxis);

    // Zoom
    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.8, 40])
      .translateExtent([
        [-Infinity, -Infinity],
        [Infinity, Infinity],
      ])
      .on("zoom", (event) => {
        setTransform(event.transform);
      });

    canvas.call(zoom as any).on("wheel.zoom", null); // Disable scroll-to-zoom on canvas
    svg.call(zoom as any); // Apply zoom to SVG overlay instead

    return () => {
      canvas.on(".zoom", null);
      svg.on(".zoom", null);
    };
  }, [xScale, yScale, transform, dimensions]);

  // --- Mouse Interaction ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;

      let nearest: DataPoint | null = null;
      let minDist = 20; // pixel radius

      for (const d of filteredData) {
        const cx = transform.applyX(xScale(d.x));
        const cy = transform.applyY(yScale(d.y));
        const dist = Math.sqrt((cx - mx) ** 2 + (cy - my) ** 2);
        if (dist < minDist) {
          minDist = dist;
          nearest = d;
        }
      }

      setHoveredPoint(nearest);
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    const handleMouseLeave = () => setHoveredPoint(null);

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;

      let nearest: DataPoint | null = null;
      let minDist = 20; // pixel radius for clickable area

      for (const d of filteredData) {
        const cx = transform.applyX(xScale(d.x));
        const cy = transform.applyY(yScale(d.y));
        const dist = Math.sqrt((cx - mx) ** 2 + (cy - my) ** 2);
        if (dist < minDist) {
          minDist = dist;
          nearest = d;
        }
      }

      if (nearest) {
        setSelectedPointId(nearest.id);
      }
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);
    canvas.style.cursor = "pointer";

    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, [filteredData, transform, xScale, yScale]);

  // --- UI Handlers ---
  const handleToggleCluster = (cluster: number) => {
    setActiveClusters((prev) => {
      const next = new Set(prev);
      if (next.has(cluster)) {
        next.delete(cluster);
      } else {
        next.add(cluster);
      }
      return next;
    });
  };

  const handleResetView = () => {
    const svg = d3.select(svgRef.current);
    const canvas = d3.select(canvasRef.current);
    if (!svg || !canvas) return;

    const zoom = d3.zoom().on("zoom", (event) => setTransform(event.transform));

    canvas
      .transition()
      .duration(750)
      .call(zoom.transform as any, d3.zoomIdentity);
    svg
      .transition()
      .duration(750)
      .call(zoom.transform as any, d3.zoomIdentity);
  };

  // --- Render ---
  if (loading)
    return <div className="status-message">Loading embeddings...</div>;
  if (error) return <div className="status-message error">Error: {error}</div>;

  return (
    <div className="visualization-container">
      <div className="sidebar">
        <h2 className="title">GSM8K Embeddings</h2>
        <p className="subtitle">
          {data.length.toLocaleString()} points visualized with t-SNE.
        </p>
        <button onClick={handleResetView} className="reset-button">
          Reset View
        </button>
        <hr className="divider" />
        <Legend
          clusterColors={clusterColors}
          activeClusters={activeClusters}
          onToggleCluster={handleToggleCluster}
        />
      </div>
      <div className="main-content">
        <div
          className="chart-area"
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "all", // Capture mouse events for hover
            }}
          />
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none", // Pass mouse events to canvas
            }}
          >
            {/* Axes are drawn here by D3 */}
          </svg>
        </div>
        <Tooltip hoveredPoint={hoveredPoint} mousePos={mousePos} />
        {selectedPointId !== null && (
          <DetailView
            pointId={selectedPointId}
            onClose={() => setSelectedPointId(null)}
          />
        )}
      </div>
    </div>
  );
};

export default EmbeddingVisualization;
