import { useEffect, useState } from "react";
import "./App.css";
import EmbeddingVisualization from "./components/EmbeddingVisualization";
import { responseDB } from "./utils/responseDB";

function App() {
  const [loadingDB, setLoadingDB] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [dbError, setDbError] = useState<string | null>(null);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(false);

  useEffect(() => {
    const initDB = async () => {
      try {
        await responseDB.loadFromFile(
          "/responses_all_with_logprobs.json",
          (loaded, total, fromCache) => {
            if (fromCache) {
              setIsLoadingFromCache(true);
            }
            setLoadProgress(Math.round((loaded / total) * 100));
          }
        );
        setLoadingDB(false);
      } catch (err) {
        console.error("Error loading data:", err);
        setDbError(err instanceof Error ? err.message : "Failed to load data");
        setLoadingDB(false);
      }
    };

    initDB();
  }, []);

  if (loadingDB) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#1a1a1a",
          color: "#e0e0e0",
        }}
      >
        <h2>
          {isLoadingFromCache
            ? "Loading from cache..."
            : "Loading GSM8K Data..."}
        </h2>
        {!isLoadingFromCache && <p>This is a one-time load (~140MB)</p>}
        {isLoadingFromCache && <p>Using cached data</p>}
        <div
          style={{
            width: "300px",
            height: "20px",
            background: "#333",
            borderRadius: "10px",
            overflow: "hidden",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              width: `${loadProgress}%`,
              height: "100%",
              background: isLoadingFromCache
                ? "linear-gradient(90deg, #22c55e, #10b981)"
                : "linear-gradient(90deg, #22c55e, #3b82f6)",
              transition: "width 0.3s",
            }}
          />
        </div>
        <p>{loadProgress}%</p>
      </div>
    );
  }

  if (dbError) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#1a1a1a",
          color: "#ef4444",
        }}
      >
        <h2>Error Loading Data</h2>
        <p>{dbError}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: "20px",
            padding: "10px 20px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return <EmbeddingVisualization />;
}

export default App;
