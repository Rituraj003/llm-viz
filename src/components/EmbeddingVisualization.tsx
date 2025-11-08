import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import * as d3 from "d3";
import Slider from "rc-slider";
import "rc-slider/assets/index.css";
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

type CorrectnessFilterType = "all" | "correct" | "incorrect";

// --- Helper Components ---

const Tooltip: React.FC<{
  hoveredPoint: DataPoint | null;
  mousePos: { x: number; y: number };
}> = ({ hoveredPoint, mousePos }) => {
  if (!hoveredPoint) return null;

  const correctness = hoveredPoint.isCorrect === 1 ? "Correct" : "Incorrect";
  const correctnessColor = hoveredPoint.isCorrect === 1 ? "#77dd77" : "#ff6b6b";
  const bgTint =
    hoveredPoint.isCorrect === 1
      ? "rgba(50, 218, 50, 0.15)"
      : "rgba(251, 46, 46, 0.15)";
  const borderColor =
    hoveredPoint.isCorrect === 1
      ? "rgba(119, 221, 119, 0.3)"
      : "rgba(255, 107, 107, 0.3)";

  return (
    <div
      style={{
        position: "fixed",
        left: mousePos.x + 15,
        top: mousePos.y,
        background: bgTint,
        backdropFilter: "blur(10px)",
        color: "#fff",
        padding: "12px 14px",
        borderRadius: "6px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        pointerEvents: "none",
        fontSize: "13px",
        zIndex: 1000,
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        transition: "opacity 0.2s, transform 0.2s",
        opacity: 1,
        transform: "translateY(-100%)",
        border: `1px solid ${borderColor}`,
      }}
    >
      <strong style={{ color: "#EAEAEA" }}>
        {CLUSTER_NAMES[hoveredPoint.cluster]}
      </strong>
      {hoveredPoint.isCorrect !== undefined && (
        <div
          style={{
            marginTop: "6px",
            color: correctnessColor,
            fontWeight: "bold",
          }}
        >
          {correctness}
        </div>
      )}
      <div
        style={{
          marginTop: "8px",
          color: "#D1D1D1",
          maxWidth: "400px",
          whiteSpace: "normal",
          wordWrap: "break-word",
          overflow: "auto",
          maxHeight: "150px",
          fontSize: "12px",
          lineHeight: "1.4",
        }}
      >
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
      <h4
        style={{
          marginBottom: "15px",
          marginTop: "5px",
          color: "#E0E0E0",
          fontWeight: 500,
        }}
      >
        Clusters
      </h4>
      <div
        style={{ maxHeight: "400px", overflowY: "auto", paddingRight: "10px" }}
      >
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
                opacity: activeClusters.has(cluster) ? 1 : 0.4,
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
                  boxShadow: `0 0 5px ${color}`,
                }}
              />
              <span style={{ fontSize: "15px", color: "#D1D1D1" }}>
                {CLUSTER_NAMES[cluster]}
              </span>
            </div>
          ))}
      </div>
    </>
  );
};

const CorrectnessLegend: React.FC<{ isFloating?: boolean }> = ({
  isFloating,
}) => {
  const legendItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    marginBottom: "10px",
    fontSize: "14px",
    color: isFloating ? "#EAEAEA" : "#D1D1D1",
  };
  const circleBaseStyle: React.CSSProperties = {
    width: "14px",
    height: "14px",
    borderRadius: "50%",
    marginRight: "10px",
  };

  return (
    <>
      <h4
        style={{
          marginBottom: "15px",
          marginTop: "5px",
          color: "#E0E0E0",
          fontWeight: 500,
          textAlign: isFloating ? "center" : "left",
        }}
      >
        Answer Type
      </h4>
      <div>
        <div style={legendItemStyle}>
          <div
            style={{
              ...circleBaseStyle,
              backgroundColor: "#77dd77",
              boxShadow: "0 0 5px #77dd77",
            }}
          ></div>
          <span>Correct</span>
        </div>
        <div style={legendItemStyle}>
          <div
            style={{
              ...circleBaseStyle,
              border: "1.5px solid #ff6b6b",
              opacity: 0.8,
            }}
          ></div>
          <span>Incorrect</span>
        </div>
      </div>
    </>
  );
};

const CorrectnessFilter: React.FC<{
  currentFilter: CorrectnessFilterType;
  onFilterChange: (filter: CorrectnessFilterType) => void;
}> = ({ currentFilter, onFilterChange }) => {
  const buttonStyle: React.CSSProperties = {
    flex: 1,
    padding: "8px 12px",
    fontSize: "13px",
    border: "1px solid #555",
    backgroundColor: "#3a3a3a",
    color: "#ccc",
    cursor: "pointer",
    transition: "background-color 0.2s, color 0.2s",
    textAlign: "center",
  };

  const activeButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: "#5a5a5a",
    color: "#fff",
    borderColor: "#777",
  };

  return (
    <div style={{ marginTop: "20px" }}>
      <h4 style={{ marginBottom: "10px", color: "#E0E0E0", fontWeight: 500 }}>
        Filter by Answer
      </h4>
      <div style={{ display: "flex", borderRadius: "6px", overflow: "hidden" }}>
        <button
          style={currentFilter === "all" ? activeButtonStyle : buttonStyle}
          onClick={() => onFilterChange("all")}
        >
          All
        </button>
        <button
          style={currentFilter === "correct" ? activeButtonStyle : buttonStyle}
          onClick={() => onFilterChange("correct")}
        >
          Correct
        </button>
        <button
          style={
            currentFilter === "incorrect" ? activeButtonStyle : buttonStyle
          }
          onClick={() => onFilterChange("incorrect")}
        >
          Incorrect
        </button>
      </div>
    </div>
  );
};

const ConfidenceSlider: React.FC<{
  minRange: number;
  maxRange: number;
  currentRange: [number, number];
  onRangeChange: (range: [number, number]) => void;
}> = ({ minRange, maxRange, currentRange, onRangeChange }) => {
  return (
    <div style={{ marginTop: "20px" }}>
      <h4 style={{ marginBottom: "10px", color: "#E0E0E0", fontWeight: 500 }}>
        Confidence Range
      </h4>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "12px",
          fontSize: "12px",
          color: "#999",
        }}
      >
        <span>{minRange.toFixed(2)}</span>
        <span style={{ color: "#4CAF50", fontWeight: 500 }}>
          {currentRange[0].toFixed(2)} - {currentRange[1].toFixed(2)}
        </span>
        <span>{maxRange.toFixed(2)}</span>
      </div>
      <div style={{ padding: "0 2px" }}>
        <Slider
          range
          min={minRange}
          max={maxRange}
          step={0.01}
          value={currentRange}
          onChange={(val) => onRangeChange(val as [number, number])}
          trackStyle={[
            {
              background: "linear-gradient(90deg, #ffc107 0%, #4CAF50 100%)",
              height: 6,
            },
          ]}
          railStyle={{
            background:
              "linear-gradient(90deg, #ff6b6b 0%, #ffc107 50%, #4CAF50 100%)",
            height: 4,
            opacity: 0.3,
          }}
          handleStyle={[
            {
              backgroundColor: "#4CAF50",
              border: "2px solid #2d5f2e",
              height: 18,
              width: 18,
              marginTop: -7,
              boxShadow: "0 0 8px rgba(76, 175, 80, 0.6)",
              cursor: "grab",
            },
            {
              backgroundColor: "#4CAF50",
              border: "2px solid #2d5f2e",
              height: 18,
              width: 18,
              marginTop: -7,
              boxShadow: "0 0 8px rgba(76, 175, 80, 0.6)",
              cursor: "grab",
            },
          ]}
        />
      </div>
    </div>
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
  avgConfidence?: number; // Average confidence of the response
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
  const [correctnessFilter, setCorrectnessFilter] =
    useState<CorrectnessFilterType>("all");
  const [confidenceRange, setConfidenceRange] = useState<[number, number]>([
    0, 1,
  ]);
  const [activeTab, setActiveTab] = useState<"filters" | "clusters">("filters");

  const dimensions = {
    width: 1000,
    height: 700,
    margin: { top: 50, right: 50, bottom: 50, left: 60 },
  };

  // --- Data Loading ---
  useEffect(() => {
    setLoading(true);
    fetch("/gsm8k_merged_data.json")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to load merged data: ${res.statusText}`);
        }
        return res.json();
      })
      .then((mergedData: DataPoint[]) => {
        setData(mergedData);
        setActiveClusters(new Set(mergedData.map((p) => p.cluster)));

        // Calculate min/max confidence
        const confidences = mergedData
          .map((d) => d.avgConfidence)
          .filter((c): c is number => c !== undefined);
        const minConfidence = Math.min(...confidences);
        const maxConfidence = Math.max(...confidences);
        setConfidenceRange([minConfidence, maxConfidence]);

        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Calculate actual min/max confidence from data for slider display
  const confidenceDataRange = useMemo(() => {
    if (data.length === 0) return [0, 1];
    const confidences = data
      .map((d) => d.avgConfidence)
      .filter((c): c is number => c !== undefined);
    if (confidences.length === 0) return [0, 1];
    return [Math.min(...confidences), Math.max(...confidences)];
  }, [data]);

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

    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);
    const clusterColors = new Map<number, string>();
    const clusters = [...new Set(data.map((d) => d.cluster))];
    clusters.forEach((c) => clusterColors.set(c, colorScale(String(c))));

    const filteredData = data.filter((d) => {
      // Filter by cluster
      if (!activeClusters.has(d.cluster)) return false;

      // Filter by confidence
      if (d.avgConfidence !== undefined) {
        if (
          d.avgConfidence < confidenceRange[0] ||
          d.avgConfidence > confidenceRange[1]
        ) {
          return false;
        }
      }

      // Filter by correctness
      if (correctnessFilter === "correct" && d.isCorrect !== 1) return false;
      if (correctnessFilter === "incorrect" && d.isCorrect !== 0) return false;

      return true;
    });

    return { xScale, yScale, clusterColors, filteredData };
  }, [data, activeClusters, correctnessFilter, confidenceRange, dimensions]);

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

      const pointRadius = 3.5;

      filteredData.forEach((d) => {
        const cx = currentTransform.applyX(xScale(d.x));
        const cy = currentTransform.applyY(yScale(d.y));

        if (cx < 0 || cx > width || cy < 0 || cy > height) return;

        ctx.beginPath();
        ctx.arc(cx, cy, pointRadius, 0, 2 * Math.PI);

        const pointColor = clusterColors.get(d.cluster) || "#999";

        if (d.isCorrect === 1) {
          ctx.fillStyle = pointColor;
          ctx.globalAlpha = 0.9;
          ctx.fill();
        } else if (d.isCorrect === 0) {
          ctx.strokeStyle = pointColor;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.fillStyle = pointColor;
          ctx.globalAlpha = 0.3;
          ctx.fill();
        }
      });

      if (hoveredPoint) {
        const cx = currentTransform.applyX(xScale(hoveredPoint.x));
        const cy = currentTransform.applyY(yScale(hoveredPoint.y));
        const hoverColor = clusterColors.get(hoveredPoint.cluster) || "#FFF";

        ctx.shadowColor = hoverColor;
        ctx.shadowBlur = 15;
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(cx, cy, pointRadius * 2.5, 0, 2 * Math.PI);

        if (hoveredPoint.isCorrect === 1) {
          ctx.fillStyle = hoverColor;
          ctx.fill();
        } else {
          ctx.strokeStyle = hoverColor;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
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

    const tx = transform.rescaleX(xScale);
    const ty = transform.rescaleY(yScale);

    const xAxis = d3.axisBottom(tx);
    const yAxis = d3.axisLeft(ty);

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

    canvas.call(zoom as any);

    return () => {
      canvas.on(".zoom", null);
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
      let minDist = 15;

      const quadtree = d3
        .quadtree<DataPoint>()
        .x((d) => transform.applyX(xScale(d.x)))
        .y((d) => transform.applyY(yScale(d.y)))
        .addAll(filteredData);

      const found = quadtree.find(mx, my, minDist);
      if (found) {
        nearest = found;
      }

      setHoveredPoint(nearest);
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    const handleMouseLeave = () => setHoveredPoint(null);

    const handleClick = (_event: MouseEvent) => {
      if (hoveredPoint) {
        setSelectedPointId(hoveredPoint.id);
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
  }, [filteredData, transform, xScale, yScale, hoveredPoint]);

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
    const canvas = d3.select(canvasRef.current);
    if (!canvas) return;

    canvas
      .transition()
      .duration(750)
      .call(
        d3.zoom<HTMLCanvasElement, unknown>().transform as any,
        d3.zoomIdentity
      );

    setActiveClusters(new Set(data.map((p) => p.cluster)));
    setCorrectnessFilter("all");
    setConfidenceRange(confidenceDataRange as [number, number]);
  };

  // --- Render ---
  if (loading)
    return <div className="status-message">Loading embeddings...</div>;
  if (error) return <div className="status-message error">Error: {error}</div>;

  return (
    <div
      className="visualization-container"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="sidebar">
        <h2
          className="title"
          style={{ fontWeight: 700, letterSpacing: "-0.5px" }}
        >
          GSM8K Embeddings
        </h2>
        <p className="subtitle">
          {data.length.toLocaleString()} points visualized with t-SNE.
        </p>
        <button
          onClick={handleResetView}
          className="reset-button"
          style={{
            background: "linear-gradient(to right, #4f4f4f, #3a3a3a)",
            border: "1px solid #666",
            boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
          }}
        >
          Reset View
        </button>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #444",
            marginTop: "20px",
            marginBottom: "15px",
          }}
        >
          <button
            onClick={() => setActiveTab("filters")}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: activeTab === "filters" ? "#3a3a3a" : "transparent",
              border: "none",
              color: activeTab === "filters" ? "#4CAF50" : "#999",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "filters" ? 600 : 400,
              borderBottom:
                activeTab === "filters" ? "2px solid #4CAF50" : "none",
              transition: "all 0.2s",
            }}
          >
            Filters
          </button>
          <button
            onClick={() => setActiveTab("clusters")}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: activeTab === "clusters" ? "#3a3a3a" : "transparent",
              border: "none",
              color: activeTab === "clusters" ? "#4CAF50" : "#999",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: activeTab === "clusters" ? 600 : 400,
              borderBottom:
                activeTab === "clusters" ? "2px solid #4CAF50" : "none",
              transition: "all 0.2s",
            }}
          >
            Clusters
          </button>
        </div>

        {/* Filters Tab */}
        {activeTab === "filters" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "15px" }}
          >
            <CorrectnessFilter
              currentFilter={correctnessFilter}
              onFilterChange={setCorrectnessFilter}
            />
            <ConfidenceSlider
              minRange={confidenceDataRange[0]}
              maxRange={confidenceDataRange[1]}
              currentRange={confidenceRange}
              onRangeChange={setConfidenceRange}
            />
          </div>
        )}

        {/* Clusters Tab */}
        {activeTab === "clusters" && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Legend
              clusterColors={clusterColors}
              activeClusters={activeClusters}
              onToggleCluster={handleToggleCluster}
            />
          </div>
        )}
      </div>
      <div className="main-content">
        <div
          className="chart-area"
          style={{
            width: dimensions.width,
            height: dimensions.height,
            position: "relative",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "all",
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
              pointerEvents: "none",
            }}
          >
            {/* Axes are drawn here by D3 */}
          </svg>
          <div
            style={{
              position: "absolute",
              top: "20px",
              left: "80px",
              backgroundColor: "rgba(42, 42, 42, 0.8)",
              backdropFilter: "blur(5px)",
              borderRadius: "8px",
              padding: "15px",
              border: "1px solid #444",
              zIndex: 10,
            }}
          >
            <CorrectnessLegend isFloating={true} />
          </div>
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
