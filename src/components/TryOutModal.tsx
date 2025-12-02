import React, { useState, useRef, useEffect, useMemo } from "react";
import "./TryOutModal.css";
import {
  computeTokenMetrics,
  getMetricColor,
  formatMetric,
  type MetricType,
  type TokenMetrics,
} from "../utils/confidenceMetrics";

interface TryOutModalProps {
  onClose: () => void;
}

interface TokenData {
  token: string;
  logprob: number;
  logprob2?: number; // Second best logprob for Gap calculation
}

interface ParsedTokens {
  isParsed: boolean;
  reasoningTokens?: TokenMetrics[];
  responseTokens?: TokenMetrics[];
  allTokens?: TokenMetrics[];
}

const TryOutModal: React.FC<TryOutModalProps> = ({ onClose }) => {
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("http://xyz/v1/chat/completions");
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricType>("confidence");
  const [hoveredToken, setHoveredToken] = useState<TokenMetrics | null>(null);
  const [isConfigCollapsed, setIsConfigCollapsed] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load saved values from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem("llm-viz-api-key");
    const savedEndpoint = localStorage.getItem("llm-viz-endpoint");
    if (savedKey) setApiKey(savedKey);
    if (savedEndpoint) setEndpoint(savedEndpoint);
  }, []);

  // Parse sections for visualization (Reasoning vs Response)
  const sections = useMemo<ParsedTokens | null>(() => {
    if (tokens.length === 0) return null;

    // Compute metrics first
    const tokenStrs = tokens.map((t) => t.token);
    const logprobs = tokens.map((t) => t.logprob);
    const logprobs2 = tokens.map((t) =>
      t.logprob2 !== undefined ? t.logprob2 : t.logprob - 999
    );

    let computed: TokenMetrics[] = [];
    try {
      computed = computeTokenMetrics(
        tokenStrs,
        logprobs,
        logprobs2,
        "local",
        metric
      );
    } catch (e) {
      console.error("Error computing metrics", e);
      return null;
    }

    // Parse based on <|message|> delimiters
    // Pattern: <|message|> [Reasoning] <|message|> [Response] <|return|>
    const fullText = tokenStrs.join("");
    const DELIMITER = "<|message|>";

    // Find all delimiter occurrences in the full text
    const indices: number[] = [];
    let pos = 0;
    while (pos < fullText.length) {
      const idx = fullText.indexOf(DELIMITER, pos);
      if (idx === -1) break;
      indices.push(idx);
      pos = idx + DELIMITER.length;
    }

    // If we don't have at least one delimiter at the start, just return standard view
    if (indices.length === 0) {
      return {
        isParsed: false,
        allTokens: computed,
      };
    }

    // Identify token ranges for sections
    let charCount = 0;
    const reasoningTokens: TokenMetrics[] = [];
    const responseTokens: TokenMetrics[] = [];
    const otherTokens: TokenMetrics[] = []; // Delimiters or pre-text

    // Define ranges based on indices
    // 1st <|message|> start = indices[0]
    // 2nd <|message|> start = indices[1] (if exists)

    const reasoningStart = indices[0] + DELIMITER.length;
    const reasoningEnd = indices.length > 1 ? indices[1] : fullText.length;

    const responseStart =
      indices.length > 1 ? indices[1] + DELIMITER.length : -1;

    computed.forEach((t) => {
      const start = charCount;
      const end = charCount + t.token.length;
      charCount = end;

      // Determine which section this token belongs to
      // We treat tokens as belonging to a section if they mostly overlap with it

      const isReasoning = start >= reasoningStart && start < reasoningEnd;
      const isResponse = responseStart !== -1 && start >= responseStart;

      if (isReasoning) {
        reasoningTokens.push(t);
      } else if (isResponse) {
        // Check for <|return|> at the end? User said "<|return|>" is end.
        // We can just strip it visually or keep it. Let's keep it for now.
        responseTokens.push(t);
      } else {
        // It's a delimiter or outside range
        // We can hide delimiters or put them in 'other'
        otherTokens.push(t);
      }
    });

    return {
      isParsed: true,
      reasoningTokens,
      responseTokens,
      allTokens: computed,
    };
  }, [tokens, metric]);

  const handleRun = async () => {
    if (!endpoint) return;

    // Save values
    localStorage.setItem("llm-viz-api-key", apiKey);
    localStorage.setItem("llm-viz-endpoint", endpoint);

    setIsConfigCollapsed(true);
    setIsLoading(true);
    setTokens([]);
    setError(null);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          model: "openai--gpt-oss-20b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 16384,
          stream: true,
          logprobs: true,
          top_logprobs: 2,
          response_format: { type: "text" },
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        // Process all complete lines
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const json = JSON.parse(dataStr);
              const choice = json.choices[0];

              if (choice.delta?.content || choice.logprobs?.content) {
                // Extract token and logprob
                // OpenAI format for logprobs in streaming is sometimes nested in `logprobs.content` list
                // but in delta it might just be content.
                // Let's handle the standard structure where `logprobs` field exists at choice level

                const logprobsContent = choice.logprobs?.content;

                if (logprobsContent && logprobsContent.length > 0) {
                  const tokenInfo = logprobsContent[0];
                  // Extract second best logprob if available in top_logprobs
                  let secondLogprob: number | undefined = undefined;
                  if (
                    tokenInfo.top_logprobs &&
                    tokenInfo.top_logprobs.length > 1
                  ) {
                    // top_logprobs should be sorted, so index 1 is second best
                    secondLogprob = tokenInfo.top_logprobs[1].logprob;
                  }

                  setTokens((prev) => [
                    ...prev,
                    {
                      token: tokenInfo.token,
                      logprob: tokenInfo.logprob,
                      logprob2: secondLogprob,
                    },
                  ]);
                } else if (choice.delta?.content) {
                  // Fallback if no logprobs but content exists
                  setTokens((prev) => [
                    ...prev,
                    {
                      token: choice.delta.content,
                      logprob: 0, // No confidence info
                    },
                  ]);
                }
              }
            } catch (e) {
              console.warn("Error parsing stream chunk", e);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Request aborted");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="try-out-overlay" onClick={onClose}>
      <div className="try-out-content" onClick={(e) => e.stopPropagation()}>
        <div className="try-out-header">
          <h2>Try Custom Prompt</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#999",
              fontSize: "24px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div className="try-out-body">
          {isConfigCollapsed ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "15px",
                padding: "10px 16px",
                background: "#2a2a2a",
                borderRadius: "6px",
                border: "1px solid #333",
              }}
            >
              <span
                style={{ fontSize: "13px", color: "#ccc", fontStyle: "italic" }}
              >
                Configuration & Prompt hidden
              </span>
              <button
                onClick={() => setIsConfigCollapsed(false)}
                style={{
                  background: "#3a3a3a",
                  border: "1px solid #555",
                  color: "#e0e0e0",
                  borderRadius: "4px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                Show Settings
              </button>
            </div>
          ) : (
            <>
              <div className="config-section">
                <div className="input-group">
                  <label>API Endpoint</label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="http://xyz/v1/chat/completions"
                  />
                </div>
                <div className="input-group">
                  <label>API Key (Optional)</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
              </div>

              <div className="prompt-section">
                <label
                  style={{
                    fontSize: "12px",
                    color: "#999",
                    fontWeight: 500,
                  }}
                >
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your prompt here..."
                />
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
            {!isLoading ? (
              <button
                className="run-button"
                onClick={handleRun}
                disabled={!endpoint || !prompt}
              >
                Generate Response
              </button>
            ) : (
              <button
                className="run-button"
                onClick={handleStop}
                style={{ background: "#ff4444" }}
              >
                Stop Generation
              </button>
            )}
          </div>

          {error && (
            <div
              style={{
                padding: "10px",
                background: "rgba(255, 68, 68, 0.1)",
                border: "1px solid rgba(255, 68, 68, 0.3)",
                borderRadius: "6px",
                color: "#ff6b6b",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          <div className="output-section">
            <div className="output-sticky-header">
              <div
                style={{
                  marginBottom: "10px",
                  fontSize: "12px",
                  color: "#666",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <span style={{ fontWeight: 600, color: "#e0e0e0" }}>
                    OUTPUT
                  </span>
                  <select
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as MetricType)}
                    style={{
                      background: "#2a2a2a",
                      color: "#e0e0e0",
                      border: "1px solid #444",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    <option value="confidence">Confidence</option>
                    <option value="surprisal">Surprisal</option>
                    <option value="gap">Gap</option>
                  </select>
                  <span style={{ color: "#666", fontSize: "11px" }}>
                    (Local Normalization)
                  </span>
                </div>
                {tokens.length > 0 && <span>{tokens.length} tokens</span>}
              </div>

              {/* Hover Info Box */}
              <div
                style={{
                  minHeight: "36px",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  background: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  padding: "4px 8px",
                }}
              >
                {hoveredToken ? (
                  <div
                    style={{
                      fontSize: "12px",
                      display: "flex",
                      gap: "16px",
                      width: "100%",
                      alignItems: "center",
                      color: "#ccc",
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
                      color: "#555",
                      fontSize: "11px",
                      fontStyle: "italic",
                    }}
                  >
                    Hover over a token to see metrics...
                  </div>
                )}
              </div>
            </div>

            <div className="output-content">
              {tokens.length === 0 && !isLoading && (
                <div style={{ color: "#444", padding: "10px" }}>
                  Response will appear here...
                </div>
              )}

              {sections?.isParsed ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                  }}
                >
                  {/* Reasoning Section */}
                  <div
                    style={{
                      borderLeft: "2px solid #444",
                      paddingLeft: "15px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        textTransform: "uppercase",
                        color: "#888",
                        marginBottom: "8px",
                        letterSpacing: "0.5px",
                      }}
                    >
                      Reasoning Process
                    </div>
                    <div
                      className="token-stream"
                      style={{ color: "#ccc", fontSize: "13px" }}
                    >
                      {(sections.reasoningTokens || []).map((t, idx) => {
                        const normalizedVal =
                          metric === "surprisal"
                            ? t.normalizedSurprisal
                            : metric === "confidence"
                            ? t.normalizedConfidence
                            : t.normalizedGap;
                        const color = getMetricColor(normalizedVal, metric);
                        return (
                          <span
                            key={`reason-${idx}`}
                            className="stream-token"
                            style={{ backgroundColor: color, color: "#111" }}
                            onMouseEnter={() => setHoveredToken(t)}
                            onMouseLeave={() => setHoveredToken(null)}
                          >
                            {t.token}
                          </span>
                        );
                      })}
                      {isLoading &&
                        (sections.responseTokens || []).length === 0 && (
                          <span className="cursor-blink">▋</span>
                        )}
                    </div>
                  </div>

                  {/* Response Section */}
                  {((sections.responseTokens || []).length > 0 ||
                    (isLoading &&
                      (sections.reasoningTokens || []).length > 0)) && (
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          textTransform: "uppercase",
                          color: "#4CAF50",
                          marginBottom: "8px",
                          letterSpacing: "0.5px",
                          fontWeight: 600,
                        }}
                      >
                        Final Response
                      </div>
                      <div className="token-stream">
                        {(sections.responseTokens || []).map((t, idx) => {
                          const normalizedVal =
                            metric === "surprisal"
                              ? t.normalizedSurprisal
                              : metric === "confidence"
                              ? t.normalizedConfidence
                              : t.normalizedGap;
                          const color = getMetricColor(normalizedVal, metric);
                          return (
                            <span
                              key={`resp-${idx}`}
                              className="stream-token"
                              style={{ backgroundColor: color, color: "#111" }}
                              onMouseEnter={() => setHoveredToken(t)}
                              onMouseLeave={() => setHoveredToken(null)}
                            >
                              {t.token}
                            </span>
                          );
                        })}
                        {isLoading &&
                          (sections.responseTokens || []).length > 0 && (
                            <span className="cursor-blink">▋</span>
                          )}
                        {isLoading &&
                          (sections.responseTokens || []).length === 0 &&
                          (sections.reasoningTokens || []).length > 0 && (
                            <span
                              className="cursor-blink"
                              style={{ color: "#4CAF50" }}
                            >
                              ▋
                            </span>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard View */
                <div className="token-stream">
                  {sections?.allTokens?.map((t, idx) => {
                    const normalizedVal =
                      metric === "surprisal"
                        ? t.normalizedSurprisal
                        : metric === "confidence"
                        ? t.normalizedConfidence
                        : t.normalizedGap;

                    const color = getMetricColor(normalizedVal, metric);

                    return (
                      <span
                        key={idx}
                        className="stream-token"
                        style={{ backgroundColor: color, color: "#111" }}
                        onMouseEnter={() => setHoveredToken(t)}
                        onMouseLeave={() => setHoveredToken(null)}
                      >
                        {t.token}
                      </span>
                    );
                  })}
                  {isLoading && <span className="cursor-blink">▋</span>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TryOutModal;
