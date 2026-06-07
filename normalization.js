(function () {
  const CUSTOM_KEY = 'cambiosTAR_custom_tar_dictionary';
  const CIMA_ENABLED_KEY = 'cambiosTAR_cima_enabled';
  const MOTIVOS = ['Fracaso viral', 'Efectos secundarios', 'Optimización', 'Interacciones', 'Otros'];

  const BASE_TAR = [
    { nombre_mostrado: 'BIC/FTC/TAF (Biktarvy)', pauta_normalizada: 'BIC/FTC/TAF', componentes: ['bictegravir', 'emtricitabina', 'tenofovir alafenamida'], tipo: 'INSTI + 2 ITIAN', sinonimos: ['Biktarvy', 'bictegravir', 'bictegravir/emtricitabina/tenofovir alafenamida', 'BIC FTC TAF', 'BIC-FTC-TAF'] },
    { nombre_mostrado: 'DTG/3TC (Dovato)', pauta_normalizada: 'DTG/3TC', componentes: ['dolutegravir', 'lamivudina'], tipo: 'INSTI + ITIAN', sinonimos: ['Dovato', 'dolutegravir/lamivudina', 'DTG 3TC', 'DTG-3TC', '3TC/DTG', 'lamivudina/dolutegravir'] },
    { nombre_mostrado: 'DTG/ABC/3TC (Triumeq)', pauta_normalizada: 'DTG/ABC/3TC', componentes: ['dolutegravir', 'abacavir', 'lamivudina'], tipo: 'INSTI + 2 ITIAN', sinonimos: ['Triumeq', 'dolutegravir/abacavir/lamivudina', 'DTG ABC 3TC'] },
    { nombre_mostrado: 'EVG/COBI/FTC/TAF (Genvoya)', pauta_normalizada: 'EVG/COBI/FTC/TAF', componentes: ['elvitegravir', 'cobicistat', 'emtricitabina', 'tenofovir alafenamida'], tipo: 'INSTI potenciado + 2 ITIAN', sinonimos: ['Genvoya', 'elvitegravir/cobicistat/emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'EVG/COBI/FTC/TDF (Stribild)', pauta_normalizada: 'EVG/COBI/FTC/TDF', componentes: ['elvitegravir', 'cobicistat', 'emtricitabina', 'tenofovir disoproxilo'], tipo: 'INSTI potenciado + 2 ITIAN', sinonimos: ['Stribild', 'elvitegravir/cobicistat/emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'DRV/COBI/FTC/TAF (Symtuza)', pauta_normalizada: 'DRV/COBI/FTC/TAF', componentes: ['darunavir', 'cobicistat', 'emtricitabina', 'tenofovir alafenamida'], tipo: 'IP potenciado + 2 ITIAN', sinonimos: ['Symtuza', 'darunavir/cobicistat/emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'DRV/COBI (Rezolsta)', pauta_normalizada: 'DRV/COBI', componentes: ['darunavir', 'cobicistat'], tipo: 'IP potenciado', sinonimos: ['Rezolsta', 'darunavir/cobicistat'] },
    { nombre_mostrado: 'DRV/r', pauta_normalizada: 'DRV/r', componentes: ['darunavir', 'ritonavir'], tipo: 'IP potenciado', sinonimos: ['darunavir/ritonavir', 'darunavir potenciado con ritonavir'] },
    { nombre_mostrado: 'RPV/FTC/TAF (Odefsey)', pauta_normalizada: 'RPV/FTC/TAF', componentes: ['rilpivirina', 'emtricitabina', 'tenofovir alafenamida'], tipo: 'ITINN + 2 ITIAN', sinonimos: ['Odefsey', 'rilpivirina/emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'RPV/FTC/TDF (Eviplera)', pauta_normalizada: 'RPV/FTC/TDF', componentes: ['rilpivirina', 'emtricitabina', 'tenofovir disoproxilo'], tipo: 'ITINN + 2 ITIAN', sinonimos: ['Eviplera', 'rilpivirina/emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'DTG/RPV (Juluca)', pauta_normalizada: 'DTG/RPV', componentes: ['dolutegravir', 'rilpivirina'], tipo: 'INSTI + ITINN', sinonimos: ['Juluca', 'dolutegravir/rilpivirina'] },
    { nombre_mostrado: 'CAB/RPV LA (Vocabria/Rekambys)', pauta_normalizada: 'CAB/RPV LA', componentes: ['cabotegravir long acting', 'rilpivirina long acting'], tipo: 'Inyectable larga duración', sinonimos: ['Vocabria/Rekambys', 'cabotegravir/rilpivirina', 'cabotegravir long acting rilpivirina long acting', 'CAB RPV', 'CAB+RPV'] },
    { nombre_mostrado: 'RAL + FTC/TDF', pauta_normalizada: 'RAL + FTC/TDF', componentes: ['raltegravir', 'emtricitabina', 'tenofovir disoproxilo'], tipo: 'INSTI + 2 ITIAN', sinonimos: ['raltegravir + emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'RAL + FTC/TAF', pauta_normalizada: 'RAL + FTC/TAF', componentes: ['raltegravir', 'emtricitabina', 'tenofovir alafenamida'], tipo: 'INSTI + 2 ITIAN', sinonimos: ['raltegravir + emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'DTG + FTC/TDF', pauta_normalizada: 'DTG + FTC/TDF', componentes: ['dolutegravir', 'emtricitabina', 'tenofovir disoproxilo'], tipo: 'INSTI + 2 ITIAN', sinonimos: ['dolutegravir + emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'DTG + FTC/TAF', pauta_normalizada: 'DTG + FTC/TAF', componentes: ['dolutegravir', 'emtricitabina', 'tenofovir alafenamida'], tipo: 'INSTI + 2 ITIAN', sinonimos: ['dolutegravir + emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'DOR/3TC/TDF (Delstrigo)', pauta_normalizada: 'DOR/3TC/TDF', componentes: ['doravirina', 'lamivudina', 'tenofovir disoproxilo'], tipo: 'ITINN + 2 ITIAN', sinonimos: ['Delstrigo', 'doravirina/lamivudina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'DOR + 3TC/TDF', pauta_normalizada: 'DOR + 3TC/TDF', componentes: ['doravirina', 'lamivudina', 'tenofovir disoproxilo'], tipo: 'ITINN + 2 ITIAN', sinonimos: ['Pifeltro + lamivudina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'EFV/FTC/TDF (Atripla)', pauta_normalizada: 'EFV/FTC/TDF', componentes: ['efavirenz', 'emtricitabina', 'tenofovir disoproxilo'], tipo: 'ITINN + 2 ITIAN', sinonimos: ['Atripla', 'efavirenz/emtricitabina/tenofovir disoproxilo'] }
  ];

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[+/_-]+/g, ' ').replace(/\s+/g, ' ');
  }

  function getCustomDictionary() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
  }

  function saveCustomDictionary(entries) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(entries));
  }

  function clearLocalNormalizationConfig() {
    localStorage.removeItem(CUSTOM_KEY);
    localStorage.removeItem(CIMA_ENABLED_KEY);
  }

  function allTarEntries() {
    const byNorm = new Map();
    [...BASE_TAR, ...getCustomDictionary()].forEach((entry) => {
      if (!entry?.pauta_normalizada) return;
      const normalized = String(entry.pauta_normalizada).trim();
      const current = byNorm.get(normalized) || { ...entry, pauta_normalizada: normalized, sinonimos: [] };
      current.sinonimos = Array.from(new Set([...(current.sinonimos || []), ...(entry.sinonimos || []), entry.nombre_mostrado, normalized].filter(Boolean)));
      current.componentes = current.componentes || entry.componentes || [];
      current.tipo = current.tipo || entry.tipo || 'Manual';
      current.nombre_mostrado = current.nombre_mostrado || entry.nombre_mostrado || normalized;
      byNorm.set(normalized, current);
    });
    return Array.from(byNorm.values());
  }

  function scoreEntry(entry, query) {
    const q = normalizeText(query);
    if (!q) return 0;
    const candidates = [entry.pauta_normalizada, entry.nombre_mostrado, ...(entry.sinonimos || []), ...(entry.componentes || [])].map(normalizeText);
    if (candidates.includes(q)) return 100;
    if (candidates.some((c) => c.includes(q) || q.includes(c))) return 80;
    const tokens = q.split(' ').filter(Boolean);
    const componentText = normalizeText([entry.pauta_normalizada, ...(entry.componentes || []), ...(entry.sinonimos || [])].join(' '));
    return tokens.length && tokens.every((t) => componentText.includes(t)) ? 70 : 0;
  }

  function normalizeTar(value) {
    const original = String(value || '').trim();
    const matches = allTarEntries().map((entry) => ({ entry, score: scoreEntry(entry, original) })).filter((m) => m.score > 0).sort((a, b) => b.score - a.score);
    if (!original) return { original, normalizado: '', reconocido: false, entry: null, matches: [] };
    if (!matches.length) return { original, normalizado: original, reconocido: false, entry: null, matches: [] };
    return { original, normalizado: matches[0].entry.pauta_normalizada, reconocido: true, entry: matches[0].entry, matches: matches.map((m) => m.entry) };
  }

  function addCustomTarEntry({ texto_introducido, pauta_normalizada, componentes, tipo, sinonimos }) {
    const normalized = String(pauta_normalizada || '').trim();
    const introduced = String(texto_introducido || '').trim();
    if (!normalized || !introduced) throw new Error('Indique texto introducido y pauta normalizada.');
    const entries = getCustomDictionary().filter((e) => e.pauta_normalizada !== normalized);
    entries.push({
      nombre_mostrado: `${normalized} (manual)`,
      pauta_normalizada: normalized,
      componentes: Array.isArray(componentes) ? componentes : String(componentes || '').split(/[,+/]/).map((v) => v.trim()).filter(Boolean),
      tipo: tipo || 'Manual',
      sinonimos: Array.from(new Set([introduced, normalized, ...(sinonimos || [])].filter(Boolean))),
      origen: 'diccionario local personalizado',
      fecha_creacion: new Date().toISOString()
    });
    saveCustomDictionary(entries);
    return entries;
  }

  function classifyReason(reason) {
    const raw = String(reason || '').trim();
    const text = normalizeText(raw);
    if (!text) return { motivo_normalizado: '', motivo_detalle: '', motivo_original: raw, clasificado: false };
    if (/fracaso|virolog|viral|rebote|virem|resist|carga viral/.test(text)) return { motivo_normalizado: 'Fracaso viral', motivo_detalle: '', motivo_original: raw, clasificado: true };
    if (/advers|toxic|intoler|renal|hepatic|rash|nause|diarrea|efecto|secundari/.test(text)) return { motivo_normalizado: 'Efectos secundarios', motivo_detalle: '', motivo_original: raw, clasificado: true };
    if (/interaccion|interacci|contraind|farmaco|medicament/.test(text)) return { motivo_normalizado: 'Interacciones', motivo_detalle: '', motivo_original: raw, clasificado: true };
    if (/optim|simplific|biterapia|mejora|actualiz|comodidad|adherencia|switch|cambio proactivo|preferencia/.test(text)) return { motivo_normalizado: 'Optimización', motivo_detalle: '', motivo_original: raw, clasificado: true };
    return { motivo_normalizado: 'Otros', motivo_detalle: raw, motivo_original: raw, clasificado: false };
  }

  function isCimaEnabled() { return localStorage.getItem(CIMA_ENABLED_KEY) === 'true'; }
  function setCimaEnabled(enabled) { localStorage.setItem(CIMA_ENABLED_KEY, enabled ? 'true' : 'false'); }

  async function searchCIMA(text) {
    if (!isCimaEnabled()) return { enabled: false, results: [], message: 'Búsqueda CIMA desactivada. La normalización usa el diccionario local.' };
    const query = String(text || '').trim();
    if (query.length < 3) return { enabled: true, results: [], message: 'Escriba al menos 3 caracteres para buscar en CIMA.' };
    try {
      const response = await fetch(`https://cima.aemps.es/cima/rest/medicamentos?nombre=${encodeURIComponent(query)}&pagina=1`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = data.resultados || data || [];
      return { enabled: true, results: items.slice(0, 5), message: 'Resultados CIMA recibidos. Se usan solo como ayuda; el guardado depende del diccionario local.' };
    } catch (error) {
      return { enabled: true, results: [], message: `CIMA no disponible desde el navegador (${error.message}). Se mantiene el diccionario local.` };
    }
  }

  window.CambiosNormalize = { MOTIVOS, BASE_TAR, normalizeText, allTarEntries, normalizeTar, getCustomDictionary, saveCustomDictionary, addCustomTarEntry, classifyReason, isCimaEnabled, setCimaEnabled, searchCIMA, clearLocalNormalizationConfig };
}());
