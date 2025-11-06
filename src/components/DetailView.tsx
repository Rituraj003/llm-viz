import React, { useEffect, useState } from "react";
import "./DetailView.css";
import { responseDB } from "../utils/responseDB";

interface Token {
  text: string;
  confidence: number;
}

interface ResponseData {
  id: number;
  prompt: string;
  response?: string;
  tokens?: string[];
  confidence_scores?: number[];
}

interface DetailViewProps {
  pointId: number;
  onClose: () => void;
}

const DetailView: React.FC<DetailViewProps> = ({ pointId, onClose }) => {
  const [data, setData] = useState<ResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Get color based on confidence score (0-1)
  // Green (high confidence) -> Yellow -> Red (low confidence)
  const getConfidenceColor = (confidence: number): string => {
    // Clamp confidence between 0 and 1
    const c = Math.max(0, Math.min(1, confidence));

    if (c >= 0.5) {
      // Green to Yellow (high to medium confidence)
      // c=1.0 -> rgb(34, 197, 94) (green)
      // c=0.5 -> rgb(234, 179, 8) (yellow)
      const ratio = (c - 0.5) * 2; // 0 to 1
      const r = Math.round(34 + (234 - 34) * (1 - ratio));
      const g = Math.round(197 + (179 - 197) * (1 - ratio));
      const b = Math.round(94 + (8 - 94) * (1 - ratio));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Red (medium to low confidence)
      // c=0.5 -> rgb(234, 179, 8) (yellow)
      // c=0.0 -> rgb(239, 68, 68) (red)
      const ratio = c * 2; // 0 to 1
      const r = Math.round(239 + (234 - 239) * ratio);
      const g = Math.round(68 + (179 - 68) * ratio);
      const b = Math.round(68 + (8 - 68) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  // Helper to split by confidence (low, medium, or high)
  const getConfidence = (c: number): "low" | "medium" | "high" => {
    const v = Math.max(0, Math.min(1, c));
    if (v >= 0.5) return "high";
    if (v >= 0.25) return "medium";
    return "low";
  };

  const tokenContainerRef = React.useRef<HTMLDivElement | null>(null);

  const renderTokens = () => {
    if (!data || !data.tokens || !data.confidence_scores) {
      return <p className="response-text">{data?.response || ""}</p>;
    }

    // Combine tokens with confidence scores
    const tokensWithConfidence: Token[] = data.tokens.map((text, i) => ({
      text,
      confidence: data.confidence_scores![i] || 0,
    }));

    return (
      <div className="token-container" ref={tokenContainerRef}>
        {tokensWithConfidence.map((token, idx) => {
          const bucket = getConfidence(token.confidence);
          return (
            <span
              key={idx}
              className={`token`}
              data-index={idx}
              data-bucket={bucket}
              style={{
                backgroundColor: getConfidenceColor(token.confidence),
                color: token.confidence > 0.3 ? "#1a1a1a" : "#ffffff",
              }}
              title={`Confidence: ${(token.confidence * 100).toFixed(1)}%`}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    );
  };

  // Merge tokens on the same line
  React.useEffect(() => {
    const container = tokenContainerRef.current;
    if (!container) return;
    const els = Array.from(
      container.querySelectorAll<HTMLSpanElement>(".token")
    );

    // remove previous merges
    els.forEach((el) => {
      el.classList.remove("merge-start", "merge-mid", "merge-end");
    });

    const raf = requestAnimationFrame(() => {
      let i = 0;
      const tolerance = 6;
      while (i < els.length) {
        const start = i;
        const startTop = els[i].offsetTop;
        const bucket = els[i].dataset.bucket;
        let j = i + 1;
        while (
          j < els.length &&
          els[j].dataset.bucket === bucket &&
          Math.abs(els[j].offsetTop - startTop) <= tolerance
        ) {
          j++;
        }

        const groupLen = j - start;
        if (groupLen > 1) {
          els[start].classList.add("merge-start");
          for (let k = start + 1; k < j - 1; k++)
            els[k].classList.add("merge-mid");
          els[j - 1].classList.add("merge-end");
        }

        i = j;
      }
    });

    return () => cancelAnimationFrame(raf);
  }, [data?.tokens, data?.confidence_scores]);

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
      <div className="detail-view-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-button" onClick={onClose}>
          ✕
        </button>

        <div className="detail-header">
          <h2>Point ID: {pointId}</h2>
        </div>

        <div className="detail-body">
          <section className="detail-section">
            <h3>Prompt</h3>
            <div className="prompt-text">{data?.prompt}</div>
          </section>

          <section className="detail-section">
            <h3>Model Response</h3>
            <div className="confidence-legend">
              <span className="legend-item">
                <span
                  className="legend-color"
                  style={{ backgroundColor: getConfidenceColor(0.75) }}
                />
                High Confidence
              </span>
              <span className="legend-item">
                <span
                  className="legend-color"
                  style={{ backgroundColor: getConfidenceColor(0.375) }}
                />
                Medium
              </span>
              <span className="legend-item">
                <span
                  className="legend-color"
                  style={{ backgroundColor: getConfidenceColor(0.125) }}
                />
                Low Confidence
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
