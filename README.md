# GSM8K Interactive Visualization

Interactive visualization of 8,792 GSM8K math problems with model responses and confidence scores. Built with React, TypeScript, D3.js, and Vite.

## Features

- 🎨 **Interactive t-SNE Visualization** - Explore 8,792 points colored by problem clusters
- ✓✗ **Correctness Indicators** - ✓ for correct answers, ✗ for incorrect answers overlaid on each point (using cluster colors)
- 🎚️ **Confidence Filtering** - Two-sided slider to filter responses by average confidence level (0-100%)
- 🔍 **Click to View Details** - See prompts, model responses, and token-level confidence
- 🎯 **Confidence Highlighting** - Color-coded tokens (🟢 Green = High, 🟡 Yellow = Medium, 🔴 Red = Low)
- 🔄 **Reset View** - One-click reset to restore zoom level, show all clusters, and reset confidence filter
- ⚡ **IndexedDB Caching** - Fast loading after initial data fetch
- 🎨 **10 Problem Clusters** - From percentage problems to measurement tasks

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Rituraj003/llm-viz.git
cd llm-viz

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## How It Works

1. **First Visit**: Loads ~140MB of data from GitHub into browser IndexedDB (one-time, ~20-30 seconds)
2. **Explore**: Click any point on the visualization
3. **View Details**: See prompt, response, and confidence-colored tokens
4. **Future Visits**: Instant load from browser cache

## Tech Stack

- **React 19** + **TypeScript** - UI framework
- **Vite** - Build tool
- **D3.js** - Data visualization
- **IndexedDB** - Browser-side data caching

## Data

- **8,792 GSM8K problems** from Mistral-7B-Instruct evaluation
- **t-SNE embeddings** for 2D visualization
- **Token-level confidence scores** from log probabilities
- **10 semantic clusters** of problem types

## Project Structure

```
src/
├── components/
│   ├── EmbeddingVisualization.tsx  # Main visualization
│   ├── DetailView.tsx              # Point detail modal
│   └── DetailView.css              # Styling
├── utils/
│   └── responseDB.ts               # IndexedDB wrapper
├── App.tsx                         # Root component with loading
└── main.tsx                        # Entry point

public/
├── gsm8k_embeddings_2d.json        # 2D coordinates (566KB)
├── gsm8k_merged_data.json          # Merged data (10MB)
├── global_stats.json               # Global statistics
└── responses_all_with_logprobs.json # Responses + confidence (~140MB)
```

## License

MIT
