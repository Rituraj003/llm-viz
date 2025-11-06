# GSM8K Interactive Visualization

Interactive visualization of 8,792 GSM8K math problems with model responses and confidence scores. Built with React, TypeScript, D3.js, and Vite.

## Features

- 🎨 **Interactive t-SNE Visualization** - Explore 8,792 points colored by problem clusters
- ✓✗ **Correctness Indicators** - ✓ for correct answers, ✗ for incorrect answers overlaid on each point (using cluster colors)
- 🔍 **Click to View Details** - See prompts, model responses, and token-level confidence
- 🎯 **Confidence Highlighting** - Color-coded tokens (🟢 Green = High, 🟡 Yellow = Medium, 🔴 Red = Low)
- 🔄 **Reset View** - One-click reset to restore zoom level and show all clusters
- ⚡ **IndexedDB Caching** - Fast loading after initial data fetch
- 🎨 **10 Problem Clusters** - From percentage problems to measurement tasks

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## How It Works

1. **First Visit**: Loads 60MB of data into browser IndexedDB (one-time, ~20 seconds)
2. **Explore**: Click any point on the visualization
3. **View Details**: See prompt, response, and confidence-colored tokens
4. **Future Visits**: Instant load from browser cache

## Tech Stack

- **React 19** + **TypeScript** - UI framework
- **Vite** - Build tool
- **D3.js** - Data visualization
- **IndexedDB** - Browser-side data caching

## Data

- **7,473 GSM8K problems** from Mistral-7B-Instruct evaluation
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
├── gsm8k_data_with_questions.json  # Questions (10MB)
└── responses_all.json              # Responses + confidence (60MB)
```

## License

MIT
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
globalIgnores(['dist']),
{
files: ['**/*.{ts,tsx}'],
extends: [
// Other configs...
// Enable lint rules for React
reactX.configs['recommended-typescript'],
// Enable lint rules for React DOM
reactDom.configs.recommended,
],
languageOptions: {
parserOptions: {
project: ['./tsconfig.node.json', './tsconfig.app.json'],
tsconfigRootDir: import.meta.dirname,
},
// other options...
},
},
])
