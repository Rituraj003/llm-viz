import React, { useEffect, useState } from "react";
import "./DetailView.css";
import { responseDB } from "../utils/responseDB";
import {
  computeTokenMetrics,
  getMetricColor,
  formatMetric,
  type TokenMetrics,
  type NormalizationMode,
  type MetricType,
  type GlobalStats,
} from "../utils/confidenceMetrics";

interface ResponseData {
  id: number;
  prompt: string;
  response?: string;
  tokens?: string[];
  confidence_scores?: number[];
  logprobs?: number[];
  logprobs2?: number[];
  isCorrect?: number;
}

interface DetailViewProps {
  pointId: number;
  onClose: () => void;
}

const DetailView: React.FC<DetailViewProps> = ({ pointId, onClose }) => {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [normMode, setNormMode] = useState<NormalizationMode>("local");
  const [metric, setMetric] = useState<MetricType>("confidence");
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const [hoveredToken, setHoveredToken] = useState<TokenMetrics | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  // Load global stats on mount
  useEffect(() => {
    fetch("/global_stats.json")
      .then((res) => res.json())
      .then((stats) => setGlobalStats(stats))
      .catch((err) => console.error("Failed to load global stats:", err));
  }, []);

  useEffect(() => {
    const fetchPointData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try IndexedDB first
        const result = await responseDB.get(pointId);
        if (result) {
          // Convert short keys to full format
          setData({
            id: result.i,
            prompt: result.p,
            response: result.r,
            tokens: result.t,
            confidence_scores: result.c,
            logprobs: result.lp,
            logprobs2: result.lp2,
            isCorrect: result.x,
          });
        } else {
          throw new Error(`No data found for point ${pointId}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchPointData();
  }, [pointId]);

  const renderTokens = () => {
    if (!data || !data.tokens) {
      return (
        <p className="response-text">
          {data?.response?.replace(/^\n+/, "") || ""}
        </p>
      );
    }

    // Check if we have logprob data
    if (!data.logprobs || !data.logprobs2) {
      return (
        <p className="response-text">
          {data.response?.replace(/^\n+/, "") || ""}
        </p>
      );
    }

    // Compute metrics
    try {
      const tokenMetrics = computeTokenMetrics(
        data.tokens,
        data.logprobs,
        data.logprobs2,
        normMode,
        metric,
        normMode === "global" ? globalStats || undefined : undefined
      );

      // Strip leading newlines from first token
      if (tokenMetrics.length > 0 && tokenMetrics[0].token.match(/^\n+/)) {
        tokenMetrics[0] = {
          ...tokenMetrics[0],
          token: tokenMetrics[0].token.replace(/^\n+/, ""),
        };
      }

      const normalizedValue =
        metric === "surprisal"
          ? tokenMetrics.map((m) => m.normalizedSurprisal)
          : metric === "confidence"
          ? tokenMetrics.map((m) => m.normalizedConfidence)
          : tokenMetrics.map((m) => m.normalizedGap);

      return (
        <div className="token-container">
          {tokenMetrics.map((tm, idx) => {
            const color = getMetricColor(normalizedValue[idx], metric);
            return (
              <span
                key={idx}
                className="token"
                style={{
                  backgroundColor: color,
                  color: "#1a1a1a",
                  cursor: "pointer",
                }}
                onMouseEnter={() => setHoveredToken(tm)}
                onMouseLeave={() => setHoveredToken(null)}
              >
                {tm.token}
              </span>
            );
          })}
        </div>
      );
    } catch (err) {
      console.error("Error computing metrics:", err);
      // Fallback to simple display
      return (
        <p className="response-text">
          {data.response?.replace(/^\n+/, "") || ""}
        </p>
      );
    }
  };

  if (loading) {
    return (
      <div className="detail-view-overlay">
        <div className="detail-view-content">
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detail-view-overlay">
        <div className="detail-view-content">
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
          <div className="error-message">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-view-overlay" onClick={onClose}>
      <div
        className="detail-view-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          border:
            data?.isCorrect === 1
              ? "3px solid rgba(119, 221, 119, 0.7)"
              : data?.isCorrect === 0
              ? "3px solid rgba(255, 107, 107, 0.7)"
              : "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow:
            data?.isCorrect === 1
              ? "inset 0 0 20px rgba(119, 221, 119, 0.15)"
              : data?.isCorrect === 0
              ? "inset 0 0 20px rgba(255, 107, 107, 0.15)"
              : "none",
        }}
      >
        <button className="close-button" onClick={onClose}>
          ✕
        </button>

        <div className="detail-body">
          <section className="detail-section">
            <h3>Prompt</h3>
            <div className="prompt-text">{data?.prompt}</div>
          </section>

          <section className="detail-section">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h3>Model Response</h3>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  fontSize: "13px",
                  alignItems: "center",
                }}
              >
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  style={{
                    background: "#2a2a2a",
                    color: "#e0e0e0",
                    border: "1px solid #444",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                  title="Show metrics information"
                >
                  ?
                </button>
                <div
                  style={{ display: "flex", gap: "6px", alignItems: "center" }}
                >
                  <label style={{ color: "#999" }}>Metric:</label>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as MetricType)}
                    style={{
                      background: "#2a2a2a",
                      color: "#e0e0e0",
                      border: "1px solid #444",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="confidence">Confidence</option>
                    <option value="surprisal">Surprisal (bits)</option>
                    <option value="gap">Gap (nats)</option>
                  </select>
                </div>
                <div
                  style={{ display: "flex", gap: "6px", alignItems: "center" }}
                >
                  <label style={{ color: "#999" }}>Scale:</label>
                  <select
                    value={normMode}
                    onChange={(e) =>
                      setNormMode(e.target.value as NormalizationMode)
                    }
                    style={{
                      background: "#2a2a2a",
                      color: "#e0e0e0",
                      border: "1px solid #444",
                      borderRadius: "4px",
                      padding: "4px 8px",
                      cursor: "pointer",
                    }}
                    disabled={!globalStats}
                  >
                    <option value="local">Local</option>
                    <option value="global">Global</option>
                  </select>
                </div>
              </div>
            </div>
            {showInfo && (
              <div
                style={{
                  background: "#2a2a2a",
                  border: "1px solid #444",
                  borderRadius: "8px",
                  padding: "16px",
                  marginBottom: "12px",
                  fontSize: "13px",
                  lineHeight: "1.6",
                }}
              >
                <h4
                  style={{
                    marginTop: 0,
                    marginBottom: "12px",
                    color: "#e0e0e0",
                  }}
                >
                  Metrics Explanation
                </h4>
                <div style={{ marginBottom: "12px" }}>
                  <strong style={{ color: "#77dd77" }}>Confidence:</strong> A
                  user-friendly metric (0-100%) showing how confident the model
                  was in choosing each token. Higher values (green) indicate
                  more confident predictions.
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <strong style={{ color: "#77dd77" }}>Surprisal:</strong> A
                  technical metric measured in bits. Lower values (green)
                  indicate tokens the model expected, while higher values (red)
                  indicate surprising or unexpected tokens.
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <strong style={{ color: "#77dd77" }}>Gap:</strong> The
                  difference between the chosen token's logprob and the
                  second-best alternative, measured in nats. Higher values
                  (green) indicate the model strongly preferred this token over
                  alternatives.
                </div>
                <h4
                  style={{
                    marginTop: "16px",
                    marginBottom: "12px",
                    color: "#e0e0e0",
                  }}
                >
                  Normalization Scales
                </h4>
                <div style={{ marginBottom: "12px" }}>
                  <strong style={{ color: "#77dd77" }}>Local:</strong> Colors
                  are normalized within this response only. Helps you see
                  relative confidence patterns within a single answer.
                </div>
                <div>
                  <strong style={{ color: "#77dd77" }}>Global:</strong> Colors
                  are normalized across the entire dataset using 5th-95th
                  percentiles. Allows comparison of confidence levels across
                  different responses.
                </div>
              </div>
            )}
            <div
              style={{
                minHeight: "50px",
                marginBottom: "8px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {hoveredToken ? (
                <div
                  style={{
                    background: "#2a2a2a",
                    border: "1px solid #444",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "12px",
                    display: "flex",
                    gap: "16px",
                    width: "100%",
                    alignItems: "center",
                  }}
                >
                  <div style={{ whiteSpace: "pre" }}>
                    <strong>Token:</strong> "{hoveredToken.token}"
                  </div>
                  <div>
                    <strong>Confidence:</strong>{" "}
                    {(hoveredToken.confidenceScore * 100).toFixed(1)}%
                  </div>
                  <div>
                    <strong>Surprisal:</strong>{" "}
                    {formatMetric(hoveredToken.surprisal, "surprisal")}
                  </div>
                  <div>
                    <strong>Gap:</strong>{" "}
                    {formatMetric(hoveredToken.gap, "gap")}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    color: "#666",
                    fontSize: "12px",
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  Hover over tokens to see detailed metrics
                </div>
              )}
            </div>
            <div className="confidence-legend">
              <span className="legend-item">
                <span
                  className="legend-color"
                  style={{
                    backgroundColor: getMetricColor(
                      metric === "surprisal" ? 0.2 : 0.8,
                      metric
                    ),
                  }}
                />
                {metric === "surprisal"
                  ? "Low Surprisal"
                  : "High " + (metric === "confidence" ? "Confidence" : "Gap")}
              </span>
              <span className="legend-item">
                <span
                  className="legend-color"
                  style={{ backgroundColor: getMetricColor(0.5, metric) }}
                />
                Medium
              </span>
              <span className="legend-item">
                <span
                  className="legend-color"
                  style={{
                    backgroundColor: getMetricColor(
                      metric === "surprisal" ? 0.8 : 0.2,
                      metric
                    ),
                  }}
                />
                {metric === "surprisal"
                  ? "High Surprisal"
                  : "Low " + (metric === "confidence" ? "Confidence" : "Gap")}
              </span>
            </div>
            {renderTokens()}
          </section>
        </div>
      </div>
    </div>
  );
};

export default DetailView;
