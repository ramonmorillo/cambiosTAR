(function () {
  const MEMORY_KEY = 'cambiosTAR_session_key';
  const SAVED_KEY = 'cambiosTAR_pseudo_key';

  function getKey() {
    return sessionStorage.getItem(MEMORY_KEY) || localStorage.getItem(SAVED_KEY) || '';
  }

  function setKey(value, persist) {
    const key = String(value || '').trim();
    if (!key) return false;
    sessionStorage.setItem(MEMORY_KEY, key);
    if (persist) localStorage.setItem(SAVED_KEY, key);
    return true;
  }

  function clearKey() {
    sessionStorage.removeItem(MEMORY_KEY);
    localStorage.removeItem(SAVED_KEY);
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

  async function pseudonymize(clinicalId, explicitKey) {
    const cleanId = String(clinicalId || '').trim();
    const key = String(explicitKey || getKey() || '').trim();
    if (!cleanId) throw new Error('Número de historia clínica obligatorio.');
    if (!key) throw new Error('No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');
    const hash = await sha256(`${key}::${cleanId}`);
    return `PT-${hash.slice(0, 16).toUpperCase()}`;
  }

  window.CambiosCrypto = { getKey, setKey, clearKey, pseudonymize, hasKey: () => Boolean(getKey()) };
}());
