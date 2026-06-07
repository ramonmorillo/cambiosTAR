(function () {
  const SESSION_PSEUDONYMIZATION_KEY = 'cambiosTAR_session_pseudonymization_key';
  const SAVED_PSEUDONYMIZATION_KEY = 'cambiosTAR_pseudonymization_key';
  const SESSION_PSEUDONYMIZATION_VERIFIER = 'cambiosTAR_session_pseudonymization_key_verifier';
  const SAVED_PSEUDONYMIZATION_VERIFIER = 'cambiosTAR_pseudonymization_key_verifier';
  const LEGACY_SESSION_KEY = 'cambiosTAR_session_key';
  const LEGACY_SAVED_KEY = 'cambiosTAR_pseudo_key';

  let activePseudonymizationKey = '';
  let activePseudonymizationKeyVerifier = '';

  function safeStorageGet(storage, key) {
    try { return storage.getItem(key) || ''; } catch (_) { return ''; }
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

  function getPersistedPseudonymizationKey() {
    return safeStorageGet(localStorage, SAVED_PSEUDONYMIZATION_KEY) || safeStorageGet(localStorage, LEGACY_SAVED_KEY);
  }

  function getSessionPseudonymizationKey() {
    return safeStorageGet(sessionStorage, SESSION_PSEUDONYMIZATION_KEY) || safeStorageGet(sessionStorage, LEGACY_SESSION_KEY);
  }

  function getActivePseudonymizationKey() {
    const storedSessionKey = getSessionPseudonymizationKey();
    const storedPersistedKey = getPersistedPseudonymizationKey();
    activePseudonymizationKey = String(activePseudonymizationKey || storedSessionKey || storedPersistedKey || '').trim();
    if (activePseudonymizationKey && !storedSessionKey) safeStorageSet(sessionStorage, SESSION_PSEUDONYMIZATION_KEY, activePseudonymizationKey);
    return activePseudonymizationKey;
  }

  function hasPersistedPseudonymizationKey() {
    return Boolean(getPersistedPseudonymizationKey());
  }

  function hasPseudonymizationKey() {
    return Boolean(getActivePseudonymizationKey());
  }

  function notifyPseudonymizationKeyChange() {
    window.dispatchEvent(new CustomEvent('pseudonymization-key-changed', {
      detail: {
        claveConfigurada: hasPseudonymizationKey(),
        persisted: hasPersistedPseudonymizationKey()
      }
    }));
  }

  function calculateAndStorePseudonymizationKeyVerifier(key, persist) {
    sha256(`cambiosTAR-key-verifier::${key}`).then((verifier) => {
      activePseudonymizationKeyVerifier = verifier;
      safeStorageSet(sessionStorage, SESSION_PSEUDONYMIZATION_VERIFIER, verifier);
      if (persist) safeStorageSet(localStorage, SAVED_PSEUDONYMIZATION_VERIFIER, verifier);
    });
  }

  function setPseudonymizationKey(value, persist) {
    const key = String(value || '').trim();
    if (!key) return false;

    activePseudonymizationKey = key;
    safeStorageSet(sessionStorage, SESSION_PSEUDONYMIZATION_KEY, key);
    safeStorageRemove(sessionStorage, LEGACY_SESSION_KEY);
    if (persist) {
      safeStorageSet(localStorage, SAVED_PSEUDONYMIZATION_KEY, key);
      safeStorageRemove(localStorage, LEGACY_SAVED_KEY);
    } else {
      safeStorageRemove(localStorage, SAVED_PSEUDONYMIZATION_KEY);
      safeStorageRemove(localStorage, SAVED_PSEUDONYMIZATION_VERIFIER);
      safeStorageRemove(localStorage, LEGACY_SAVED_KEY);
    }
    calculateAndStorePseudonymizationKeyVerifier(key, persist);
    notifyPseudonymizationKeyChange();
    return true;
  }

  function clearPseudonymizationKey() {
    activePseudonymizationKey = '';
    activePseudonymizationKeyVerifier = '';
    [SESSION_PSEUDONYMIZATION_KEY, SESSION_PSEUDONYMIZATION_VERIFIER, LEGACY_SESSION_KEY].forEach((key) => safeStorageRemove(sessionStorage, key));
    [SAVED_PSEUDONYMIZATION_KEY, SAVED_PSEUDONYMIZATION_VERIFIER, LEGACY_SAVED_KEY].forEach((key) => safeStorageRemove(localStorage, key));
    notifyPseudonymizationKeyChange();
  }

  async function pseudonymize(clinicalId, explicitPseudonymizationKey) {
    const cleanId = String(clinicalId || '').trim();
    const pseudonymizationKey = String(explicitPseudonymizationKey || getActivePseudonymizationKey() || '').trim();
    if (!cleanId) throw new Error('Número de historia clínica obligatorio.');
    if (!pseudonymizationKey) throw new Error('No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');
    const hash = await sha256(`${pseudonymizationKey}::${cleanId}`);
    return `PT-${hash.slice(0, 16).toUpperCase()}`;
  }

  function initializePseudonymizationKey() {
    const key = getActivePseudonymizationKey();
    activePseudonymizationKeyVerifier = safeStorageGet(sessionStorage, SESSION_PSEUDONYMIZATION_VERIFIER) || safeStorageGet(localStorage, SAVED_PSEUDONYMIZATION_VERIFIER);
    if (key && !activePseudonymizationKeyVerifier) calculateAndStorePseudonymizationKeyVerifier(key, hasPersistedPseudonymizationKey());
  }

  initializePseudonymizationKey();

  window.CambiosCrypto = {
    setPseudonymizationKey,
    getActivePseudonymizationKey,
    hasPseudonymizationKey,
    clearPseudonymizationKey,
    hasPersistedPseudonymizationKey,
    pseudonymize,
    sha256,
    getPseudonymizationKeyVerifier: () => activePseudonymizationKeyVerifier,
    getKey: getActivePseudonymizationKey,
    setKey: setPseudonymizationKey,
    clearKey: clearPseudonymizationKey,
    hasKey: hasPseudonymizationKey
  };
}());
