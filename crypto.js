(function () {
  const PSEUDONYMIZATION_KEY_STORAGE = 'cambiosTAR_pseudonymization_key';

  function safeStorageGet(storage, key) {
    try { return storage.getItem(key); } catch (_) { return null; }
  }

  function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); return true; } catch (_) { return false; }
  }

  function safeStorageRemove(storage, key) {
    try { storage.removeItem(key); } catch (_) { /* Storage can be unavailable in restricted browsers. */ }
  }

  async function sha256(message) {
    if (window.crypto && window.crypto.subtle) {
      const bytes = new TextEncoder().encode(message);
      const digest = await window.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let hash = 0;
    for (let i = 0; i < message.length; i += 1) hash = ((hash << 5) - hash + message.charCodeAt(i)) | 0;
    return `fallback-${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }

  function callSecurityStateUpdate() {
    if (typeof window.updateSecurityState === 'function') window.updateSecurityState();
    window.dispatchEvent(new CustomEvent('pseudonymization-key-changed', {
      detail: { configured: hasPseudonymizationKey(), persisted: hasPseudonymizationKey() }
    }));
  }

  function setPseudonymizationKey(key) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) {
      alert('La clave local no puede estar vacía.');
      return false;
    }
    if (!safeStorageSet(localStorage, PSEUDONYMIZATION_KEY_STORAGE, cleanKey)) {
      alert('No se ha podido guardar la clave local en este navegador.');
      return false;
    }
    // Also persist in IndexedDB so the key survives a localStorage-only clear.
    if (window.CambiosStorage?.saveSetting) {
      window.CambiosStorage.saveSetting(PSEUDONYMIZATION_KEY_STORAGE, cleanKey).catch(() => {});
    }
    callSecurityStateUpdate();

    const msg = document.getElementById('security-message');
    if (msg) {
      msg.textContent = 'Clave local configurada correctamente. Ya puede registrar cambios.';
    }

    console.log('Clave guardada:', hasPseudonymizationKey());
    return true;
  }

  function getPseudonymizationKey() {
    return safeStorageGet(localStorage, PSEUDONYMIZATION_KEY_STORAGE);
  }

  function hasPseudonymizationKey() {
    const key = getPseudonymizationKey();
    return !!key && key.trim().length > 0;
  }

  function clearPseudonymizationKey() {
    safeStorageRemove(localStorage, PSEUDONYMIZATION_KEY_STORAGE);
    if (window.CambiosStorage?.deleteSetting) {
      window.CambiosStorage.deleteSetting(PSEUDONYMIZATION_KEY_STORAGE).catch(() => {});
    }
    callSecurityStateUpdate();

    const msg = document.getElementById('security-message');
    if (msg) {
      msg.textContent = 'Clave local eliminada.';
    }
  }

  // Restores the key from IndexedDB into localStorage if localStorage is empty.
  // Call once at app startup to recover from a localStorage-only clear.
  async function restoreKeyFromIndexedDB() {
    if (hasPseudonymizationKey()) return; // already in localStorage, nothing to do
    if (!window.CambiosStorage?.loadSetting) return;
    try {
      const saved = await window.CambiosStorage.loadSetting(PSEUDONYMIZATION_KEY_STORAGE);
      if (saved && String(saved).trim()) {
        safeStorageSet(localStorage, PSEUDONYMIZATION_KEY_STORAGE, String(saved).trim());
        callSecurityStateUpdate();
      }
    } catch (_) { /* IndexedDB unavailable */ }
  }

  async function pseudonymize(clinicalId, explicitPseudonymizationKey) {
    const cleanId = String(clinicalId || '').trim();
    const key = String(explicitPseudonymizationKey || getPseudonymizationKey() || '').trim();
    if (!cleanId) throw new Error('Número de historia clínica obligatorio.');
    if (!key) throw new Error('No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');
    const hash = await sha256(`${key}::${cleanId}`);
    return `PT-${hash.slice(0, 16).toUpperCase()}`;
  }

  window.PSEUDONYMIZATION_KEY_STORAGE = PSEUDONYMIZATION_KEY_STORAGE;
  window.setPseudonymizationKey = setPseudonymizationKey;
  window.getPseudonymizationKey = getPseudonymizationKey;
  window.hasPseudonymizationKey = hasPseudonymizationKey;
  window.clearPseudonymizationKey = clearPseudonymizationKey;

  window.CambiosCrypto = {
    PSEUDONYMIZATION_KEY_STORAGE,
    setPseudonymizationKey,
    getPseudonymizationKey,
    hasPseudonymizationKey,
    clearPseudonymizationKey,
    restoreKeyFromIndexedDB,
    pseudonymize,
    sha256,
    getPseudonymizationKeyVerifier: () => '',
    getKey: getPseudonymizationKey,
    setKey: setPseudonymizationKey,
    clearKey: clearPseudonymizationKey,
    hasKey: hasPseudonymizationKey
  };
}());
