/**
 * IndexedDB utility for storing and retrieving GSM8K responses.
 * This provides better performance than individual file fetches.
 */

const DB_NAME = "GSM8K_Responses";
const DB_VERSION = 2; // Incremented for logprob data
const STORE_NAME = "responses";

interface ResponseData {
  i: number; // id
  p: string; // prompt
  r: string; // response
  t: string[]; // tokens
  c: number[]; // confidence_scores (exp(logprob))
  lp?: number[]; // chosen logprobs
  lp2?: number[]; // second-best logprobs
  g?: string; // ground_truth
  a?: string; // predicted_answer
  x?: number; // correctness
}

class ResponseDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private loadPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        console.log(`DB upgrade: v${oldVersion} -> v${DB_VERSION}`);

        // If upgrading from v1 to v2, delete old store to force reload with new data
        if (oldVersion === 1 && DB_VERSION === 2) {
          if (db.objectStoreNames.contains(STORE_NAME)) {
            db.deleteObjectStore(STORE_NAME);
            console.log("Deleted old store to reload with logprob data");
          }
        }

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "i" });
        }
      };
    });

    return this.initPromise;
  }

  async loadFromFile(
    url: string,
    onProgress?: (loaded: number, total: number, fromCache?: boolean) => void
  ): Promise<void> {
    // Prevent double execution (React Strict Mode runs effects twice)
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this._loadFromFileInternal(url, onProgress);
    return this.loadPromise;
  }

  private async _loadFromFileInternal(
    url: string,
    onProgress?: (loaded: number, total: number, fromCache?: boolean) => void
  ): Promise<void> {
    await this.init();
    if (!this.db) throw new Error("DB not initialized");

    // Check if already loaded
    const count = await this.count();
    if (count > 0) {
      console.log(`IndexedDB already has ${count} entries`);
      // Signal that data is ready (loaded from cache)
      if (onProgress) {
        onProgress(count, count, true);
      }
      return;
    }

    console.log("Loading data into IndexedDB...");

    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Failed to fetch: ${response.statusText}`);

    const data: ResponseData[] = await response.json();

    const transaction = this.db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    let loaded = 0;
    const total = data.length;

    for (const item of data) {
      // Use put instead of add to allow overwrites (handles React Strict Mode double-execution)
      store.put(item);
      loaded++;
      if (loaded % 100 === 0 && onProgress) {
        onProgress(loaded, total);
      }
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log(`Loaded ${total} entries into IndexedDB`);
        if (onProgress) onProgress(total, total);
        resolve();
      };
      transaction.onerror = () => {
        const error = transaction.error || new Error("Transaction failed");
        console.error("IndexedDB transaction error:", error);
        reject(error);
      };
      transaction.onabort = () => {
        const error = transaction.error || new Error("Transaction aborted");
        console.error("IndexedDB transaction aborted:", error);
        reject(error);
      };
    });
  }

  async get(id: number): Promise<ResponseData | null> {
    await this.init();
    if (!this.db) throw new Error("DB not initialized");

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async count(): Promise<number> {
    await this.init();
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Clear all data from the database (useful for forcing reload)
  async clear(): Promise<void> {
    await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => {
        console.log("IndexedDB cleared");
        this.loadPromise = null; // Reset load promise to allow reload
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
export const responseDB = new ResponseDB();
