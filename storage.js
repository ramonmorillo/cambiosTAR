(function () {
  // Fuente principal de registros TAR: IndexedDB cambiosTAR_db/records.
  // Fallback localStorage seguro: cambiosTAR_records; cambiosTAR_records_fallback solo se lee para compatibilidad histórica.
  const DB_NAME = 'cambiosTAR_db';
  const STORE = 'records';
  const SETTINGS_STORE = 'settings';
  const VERSION = 2;
  const LS_KEY = 'cambiosTAR_records';
  const LEGACY_LS_KEY = 'cambiosTAR_records_fallback';
  let dbPromise;

  function openDb() {
    if (!window.indexedDB) return Promise.resolve(null);
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
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'k' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return dbPromise;
  }

  function fallbackRecords() {
    try {
      const current = localStorage.getItem(LS_KEY);
      const legacy = localStorage.getItem(LEGACY_LS_KEY);
      if (!current && legacy) localStorage.setItem(LS_KEY, legacy);
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch { return []; }
  }
  function setFallback(records) { localStorage.setItem(LS_KEY, JSON.stringify(records)); localStorage.removeItem(LEGACY_LS_KEY); }

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

  async function saveSetting(key, value) {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      tx.objectStore(SETTINGS_STORE).put({ k: key, v: value });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadSetting(key) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readonly');
      const req = tx.objectStore(SETTINGS_STORE).get(key);
      req.onsuccess = () => resolve(req.result?.v ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteSetting(key) {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      tx.objectStore(SETTINGS_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
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
    localStorage.removeItem(LEGACY_LS_KEY);
    const db = await openDb();
    if (!db) return;
    await withStore('readwrite', (store) => store.clear());
  }

  window.CambiosStorage = { getAllRecords, saveRecord, bulkSave, deleteRecord, clearAll, saveSetting, loadSetting, deleteSetting, keys: { DB_NAME, STORE, LS_KEY, LEGACY_LS_KEY } };
}());

