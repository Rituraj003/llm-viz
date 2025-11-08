/**
 * Sophisticated confidence metrics based on logprobs
 * Implements surprisal (bits) and gap (nats) with local/global normalization
 */

export interface TokenMetrics {
  token: string;
  confidence: number; // Original exp(logprob)
  logprob: number; // Chosen token logprob
  logprob2: number; // Second-best token logprob
  surprisal: number; // -logprob / ln(2) in bits
  confidenceScore: number; // Inverse of surprisal (0-1)
  gap: number; // logprob - logprob2 in nats
  normalizedSurprisal: number; // 0-1 after normalization
  normalizedConfidence: number; // 0-1 after normalization
  normalizedGap: number; // 0-1 after normalization
}

export interface GlobalStats {
  surprisal_p5: number;
  surprisal_p95: number;
  gap_p5: number;
  gap_p95: number;
}

export type NormalizationMode = "local" | "global";
export type MetricType = "surprisal" | "gap" | "confidence";

/**
 * Compute surprisal from logprob
 * Surprisal measures "surprise" - lower is more confident
 * Formula: -logprob / ln(2) converts to bits
 */
export function computeSurprisal(logprob: number): number {
  return -logprob / Math.LN2;
}

/**
 * Compute confidence from surprisal
 * Confidence is inverse of surprisal - higher is more confident
 * We invert and normalize surprisal to [0, 1] range
 */
export function computeConfidence(
  surprisal: number,
  maxSurprisal: number = 10
): number {
  // Clamp surprisal to reasonable range and invert
  const clampedSurprisal = Math.min(surprisal, maxSurprisal);
  return 1 - clampedSurprisal / maxSurprisal;
}

/**
 * Compute gap between chosen and second-best token
 * Gap measures confidence - higher is more confident
 * Formula: logprob_chosen - logprob_second_best
 */
export function computeGap(logprob: number, logprob2: number): number {
  return logprob - logprob2;
}

/**
 * Local normalization (per-response min-max scaling)
 * Maps values to [0, 1] range within the response
 */
export function normalizeLocal(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (max === min) {
    return values.map(() => 0.5);
  }

  return values.map((v) => (v - min) / (max - min));
}

/**
 * Global normalization using dataset percentiles
 * Maps values to [0, 1] using p5-p95 range, clamped
 */
export function normalizeGlobal(
  values: number[],
  p5: number,
  p95: number
): number[] {
  const range = p95 - p5;

  if (range === 0) {
    return values.map(() => 0.5);
  }

  return values.map((v) => {
    const normalized = (v - p5) / range;
    // Clamp to [0, 1] to handle outliers
    return Math.max(0, Math.min(1, normalized));
  });
}

/**
 * Compute all metrics for a response
 */
export function computeTokenMetrics(
  tokens: string[],
  logprobs: number[],
  logprobs2: number[],
  mode: NormalizationMode,
  _metric: MetricType, // Unused but kept for API consistency
  globalStats?: GlobalStats
): TokenMetrics[] {
  // Compute raw metrics
  const surprisals = logprobs.map((lp) => computeSurprisal(lp));
  const gaps = logprobs.map((lp, i) => computeGap(lp, logprobs2[i]));

  // Compute confidence scores (inverse of surprisal)
  const maxSurprisal = Math.max(...surprisals);
  const confidenceScores = surprisals.map((s) =>
    computeConfidence(s, maxSurprisal)
  );

  // Normalize based on mode
  let normalizedSurprisals: number[];
  let normalizedGaps: number[];
  let normalizedConfidences: number[];

  if (mode === "local") {
    normalizedSurprisals = normalizeLocal(surprisals);
    normalizedGaps = normalizeLocal(gaps);
    normalizedConfidences = normalizeLocal(confidenceScores);
  } else {
    // Global mode requires stats
    if (!globalStats) {
      throw new Error("Global stats required for global normalization");
    }
    normalizedSurprisals = normalizeGlobal(
      surprisals,
      globalStats.surprisal_p5,
      globalStats.surprisal_p95
    );
    normalizedGaps = normalizeGlobal(
      gaps,
      globalStats.gap_p5,
      globalStats.gap_p95
    );
    // For confidence, we use inverted surprisal percentiles
    // Since confidence = 1 - surprisal_normalized, higher surprisal P95 → lower confidence
    const confidenceP5 = computeConfidence(
      globalStats.surprisal_p95,
      maxSurprisal
    );
    const confidenceP95 = computeConfidence(
      globalStats.surprisal_p5,
      maxSurprisal
    );
    normalizedConfidences = normalizeGlobal(
      confidenceScores,
      confidenceP5,
      confidenceP95
    );
  }

  // Build result array
  return tokens.map((token, i) => ({
    token,
    confidence: Math.exp(logprobs[i]),
    logprob: logprobs[i],
    logprob2: logprobs2[i],
    surprisal: surprisals[i],
    confidenceScore: confidenceScores[i],
    gap: gaps[i],
    normalizedSurprisal: normalizedSurprisals[i],
    normalizedConfidence: normalizedConfidences[i],
    normalizedGap: normalizedGaps[i],
  }));
}

/**
 * Get color for normalized metric value
 * For surprisal: Low (green) = confident, High (red) = uncertain
 * For confidence: High (green) = confident, Low (red) = uncertain
 * For gap: High (green) = confident, Low (red) = uncertain
 */
export function getMetricColor(
  normalizedValue: number,
  metric: MetricType
): string {
  // For surprisal, invert the value (low surprisal = high confidence)
  // For confidence and gap, use value directly (high = confident)
  const colorValue =
    metric === "surprisal" ? 1 - normalizedValue : normalizedValue;

  // Map to color gradient: green (confident) -> yellow -> red (uncertain)
  if (colorValue > 0.66) {
    // Green zone (confident)
    const t = (colorValue - 0.66) / 0.34;
    const r = Math.round(119 * (1 - t) + 34 * t);
    const g = Math.round(221 * (1 - t) + 197 * t);
    const b = Math.round(119 * (1 - t) + 94 * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else if (colorValue > 0.33) {
    // Yellow zone (medium confidence)
    const t = (colorValue - 0.33) / 0.33;
    const r = Math.round(255 * (1 - t) + 119 * t);
    const g = Math.round(235 * (1 - t) + 221 * t);
    const b = Math.round(59 * (1 - t) + 119 * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Red zone (uncertain)
    const t = colorValue / 0.33;
    const r = Math.round(255);
    const g = Math.round(107 * (1 - t) + 235 * t);
    const b = Math.round(107 * (1 - t) + 59 * t);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

/**
 * Format metric value for display
 */
export function formatMetric(value: number, metric: MetricType): string {
  if (metric === "surprisal") {
    return `${value.toFixed(2)} bits`;
  } else if (metric === "confidence") {
    return `${(value * 100).toFixed(1)}%`;
  } else {
    return `${value.toFixed(3)} nats`;
  }
}

/**
 * Compute global percentiles from all data
 * This should be run once and cached
 */
export function computePercentile(
  values: number[],
  percentile: number
): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(sorted.length * percentile);
  return sorted[index];
}
