(function () {
  const DB_NAME = 'cambiosTAR_db';
  const STORE = 'records';
  const VERSION = 1;
  const LS_KEY = 'cambiosTAR_records_fallback';
  let dbPromise;

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('patient_id', 'patient_id', { unique: false });
          store.createIndex('fecha', 'fecha', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  function fallbackRecords() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  }
  function setFallback(records) { localStorage.setItem(LS_KEY, JSON.stringify(records)); }

  async function withStore(mode, callback) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      result = callback(store);
    });
  }

  async function getAllRecords() {
    const db = await openDb();
    if (!db) return fallbackRecords();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveRecord(record) {
    const db = await openDb();
    if (!db) {
      const records = fallbackRecords().filter((r) => r.id !== record.id);
      records.push(record);
      setFallback(records);
      return record;
    }
    await withStore('readwrite', (store) => store.put(record));
    return record;
  }

  async function bulkSave(records) {
    const db = await openDb();
    if (!db) {
      const current = fallbackRecords();
      const map = new Map(current.map((r) => [r.id, r]));
      records.forEach((r) => map.set(r.id, r));
      setFallback(Array.from(map.values()));
      return records.length;
    }
    await withStore('readwrite', (store) => records.forEach((record) => store.put(record)));
    return records.length;
  }

  async function deleteRecord(id) {
    const db = await openDb();
    if (!db) return setFallback(fallbackRecords().filter((r) => r.id !== id));
    return withStore('readwrite', (store) => store.delete(id));
  }

  async function clearAll() {
    localStorage.removeItem(LS_KEY);
    const db = await openDb();
    if (!db) return;
    await withStore('readwrite', (store) => store.clear());
  }

  window.CambiosStorage = { getAllRecords, saveRecord, bulkSave, deleteRecord, clearAll };
}());
