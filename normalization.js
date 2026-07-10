(function () {
  const CUSTOM_KEY = 'cambiosTAR_custom_dictionary';
  const LEGACY_CUSTOM_KEY = 'cambiosTAR_custom_tar_dictionary';
  const CIMA_ENABLED_KEY = 'cambiosTAR_cima_enabled';
  const MOTIVOS = ['Fracaso viral', 'Efectos secundarios', 'Optimización', 'Interacciones', 'Otros'];
  const cimaSearchCache = new Map();

  const BASE_TAR = [
    { nombre_mostrado: 'BIC/FTC/TAF (Biktarvy)', pauta_normalizada: 'BIC/FTC/TAF', componentes: ['BIC', 'FTC', 'TAF'], tipo: 'Combinación', sinonimos: ['Biktarvy', 'bictegravir/emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'DTG/3TC (Dovato)', pauta_normalizada: 'DTG/3TC', componentes: ['DTG', '3TC'], tipo: 'Combinación', sinonimos: ['Dovato', 'dolutegravir/lamivudina'] },
    { nombre_mostrado: 'DTG/ABC/3TC (Triumeq)', pauta_normalizada: 'DTG/ABC/3TC', componentes: ['DTG', 'ABC', '3TC'], tipo: 'Combinación', sinonimos: ['Triumeq', 'dolutegravir/abacavir/lamivudina'] },
    { nombre_mostrado: 'EVG/COBI/FTC/TAF (Genvoya)', pauta_normalizada: 'EVG/COBI/FTC/TAF', componentes: ['EVG', 'COBI', 'FTC', 'TAF'], tipo: 'Combinación', sinonimos: ['Genvoya', 'elvitegravir/cobicistat/emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'EVG/COBI/FTC/TDF (Stribild)', pauta_normalizada: 'EVG/COBI/FTC/TDF', componentes: ['EVG', 'COBI', 'FTC', 'TDF'], tipo: 'Combinación', sinonimos: ['Stribild', 'elvitegravir/cobicistat/emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'DRV/COBI/FTC/TAF (Symtuza)', pauta_normalizada: 'DRV/COBI/FTC/TAF', componentes: ['DRV', 'COBI', 'FTC', 'TAF'], tipo: 'Combinación', sinonimos: ['Symtuza', 'darunavir/cobicistat/emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'RPV/FTC/TAF (Odefsey)', pauta_normalizada: 'RPV/FTC/TAF', componentes: ['RPV', 'FTC', 'TAF'], tipo: 'Combinación', sinonimos: ['Odefsey', 'rilpivirina/emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'RPV/FTC/TDF (Eviplera)', pauta_normalizada: 'RPV/FTC/TDF', componentes: ['RPV', 'FTC', 'TDF'], tipo: 'Combinación', sinonimos: ['Eviplera', 'rilpivirina/emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'DTG/RPV (Juluca)', pauta_normalizada: 'DTG/RPV', componentes: ['DTG', 'RPV'], tipo: 'Combinación', sinonimos: ['Juluca', 'dolutegravir/rilpivirina'] },
    { nombre_mostrado: 'CAB/RPV LA (Vocabria + Rekambys)', pauta_normalizada: 'CAB/RPV LA', componentes: ['CAB', 'RPV'], tipo: 'Inyectable larga duración', sinonimos: ['Vocabria/Rekambys', 'Vocabria + Rekambys', 'cabotegravir/rilpivirina larga duración'] },
    { nombre_mostrado: 'DOR/3TC/TDF (Delstrigo)', pauta_normalizada: 'DOR/3TC/TDF', componentes: ['DOR', '3TC', 'TDF'], tipo: 'Combinación', sinonimos: ['Delstrigo', 'doravirina/lamivudina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'EFV/FTC/TDF (Atripla)', pauta_normalizada: 'EFV/FTC/TDF', componentes: ['EFV', 'FTC', 'TDF'], tipo: 'Combinación', sinonimos: ['Atripla', 'efavirenz/emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'FTC/TAF (Descovy)', pauta_normalizada: 'FTC/TAF', componentes: ['FTC', 'TAF'], tipo: 'Combinación', sinonimos: ['Descovy', 'emtricitabina/tenofovir alafenamida'] },
    { nombre_mostrado: 'FTC/TDF (Truvada)', pauta_normalizada: 'FTC/TDF', componentes: ['FTC', 'TDF'], tipo: 'Combinación', sinonimos: ['Truvada', 'emtricitabina/tenofovir disoproxilo'] },
    { nombre_mostrado: 'DRV/r', pauta_normalizada: 'DRV/r', componentes: ['DRV', 'r'], tipo: 'Combinación', sinonimos: ['Prezista + Norvir', 'darunavir/ritonavir'] },
    { nombre_mostrado: 'DRV/COBI (Rezolsta)', pauta_normalizada: 'DRV/COBI', componentes: ['DRV', 'COBI'], tipo: 'Combinación', sinonimos: ['Rezolsta', 'darunavir/cobicistat'] },
    { nombre_mostrado: 'LPV/r (Kaletra)', pauta_normalizada: 'LPV/r', componentes: ['LPV', 'r'], tipo: 'Combinación', sinonimos: ['Kaletra', 'lopinavir/ritonavir'] }
  ];

  const SINGLE_EQUIVALENCES = [
    ['bictegravir', 'BIC'], ['emtricitabina', 'FTC'], ['tenofovir alafenamida', 'TAF'], ['tenofovir disoproxilo', 'TDF'], ['tenofovir disoproxil', 'TDF'],
    ['dolutegravir', 'DTG'], ['lamivudina', '3TC'], ['abacavir', 'ABC'], ['elvitegravir', 'EVG'], ['cobicistat', 'COBI'],
    ['darunavir', 'DRV'], ['ritonavir', 'r'], ['rilpivirina', 'RPV'], ['cabotegravir', 'CAB'], ['raltegravir', 'RAL'],
    ['lopinavir', 'LPV'], ['doravirina', 'DOR'], ['efavirenz', 'EFV'], ['nevirapina', 'NVP'], ['etravirina', 'ETR'], ['maraviroc', 'MVC'],
    ['enfuvirtida', 'T20'], ['fostemsavir', 'FTR'], ['lenacapavir', 'LEN'], ['ibalizumab', 'IBA'],
    ['tivicay', 'DTG'], ['prezista', 'DRV'], ['norvir', 'r'], ['tybost', 'COBI'], ['isentress', 'RAL'], ['pifeltro', 'DOR'], ['edurant', 'RPV'], ['kaletra', 'LPV/r'], ['vocabria', 'CAB'], ['rekambys', 'RPV']
  ];
  const COMBINATION_EQUIVALENCES = BASE_TAR.flatMap((entry) => [entry.nombre_mostrado, ...(entry.sinonimos || [])].map((name) => [name, entry.pauta_normalizada]));
  const ORDER = ['FTC/TAF', 'FTC/TDF', 'BIC', 'DTG', 'CAB', 'RAL', 'EVG', 'DRV/r', 'DRV/COBI', 'LPV/r', 'DRV', 'COBI', 'r', 'DOR', 'RPV', 'EFV', 'NVP', 'ETR', 'MVC', 'T20', 'FTR', 'LEN', 'IBA', 'ABC', '3TC', 'FTC', 'TAF', 'TDF'];

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[+/_(),-]+/g, ' ').replace(/\s+/g, ' ');
  }

  function getCustomDictionary() {
    try {
      const current = localStorage.getItem(CUSTOM_KEY);
      const legacy = localStorage.getItem(LEGACY_CUSTOM_KEY);
      if (!current && legacy) localStorage.setItem(CUSTOM_KEY, legacy);
      return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]');
    } catch { return []; }
  }

  function saveCustomDictionary(entries) {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(entries));
    localStorage.removeItem(LEGACY_CUSTOM_KEY);
  }

  function clearLocalNormalizationConfig() {
    localStorage.removeItem(CUSTOM_KEY);
    localStorage.removeItem(LEGACY_CUSTOM_KEY);
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
    if (!original) return { original, normalizado: '', reconocido: false, entry: null, matches: [], advertencia: false };
    const med = { nombre: original, principio_activo: original, fuente: 'Manual' };
    const normalized = normalizarPautaTAR([med]);
    return { original, normalizado: normalized.pauta || original, reconocido: normalized.reconocido, entry: normalized.matches?.[0] || null, matches: normalized.matches || [], advertencia: normalized.advertencia };
  }

  function tokenizePauta(pauta) {
    return String(pauta || '').split(/\s*\+\s*/).flatMap((group) => group.split('/').map((v) => v.trim()).filter(Boolean));
  }

  function findCombinations(text) {
    const q = normalizeText(text);
    if (!q) return [];
    const candidates = [...COMBINATION_EQUIVALENCES, ...getCustomDictionary().flatMap((entry) => [entry.nombre_mostrado, ...(entry.sinonimos || [])].filter(Boolean).map((name) => [name, entry.pauta_normalizada]))];
    return Array.from(new Set(candidates.filter(([name]) => {
      const n = normalizeText(name);
      if (!n) return false;
      // Seguridad farmacológica: una combinación solo se reconoce cuando el
      // medicamento seleccionado contiene el nombre comercial o la combinación
      // exacta. No se infieren combos por coincidencias parciales de principios
      // activos sueltos (p. ej. emtricitabina no implica BIC/FTC/TAF).
      return q === n || q.includes(n);
    }).map(([, pauta]) => pauta)));
  }

  function findSingleComponents(text) {
    const q = normalizeText(text);
    if (!q) return [];
    const found = [];
    SINGLE_EQUIVALENCES.forEach(([name, code]) => {
      const n = normalizeText(name);
      if (n && (q === n || q.includes(n))) found.push(code);
    });
    tokenizePauta(text).forEach((token) => {
      const upper = token === 'r' ? 'r' : token.toUpperCase();
      if (ORDER.includes(upper) || ['LPV', 'BIC', 'FTC', 'TAF', 'TDF', 'DTG', '3TC', 'ABC', 'EVG', 'COBI', 'DRV', 'RPV', 'CAB', 'RAL', 'DOR', 'EFV', 'NVP', 'ETR', 'MVC', 'T20', 'FTR', 'LEN', 'IBA'].includes(upper)) found.push(upper);
    });
    return found;
  }

  function orderGroups(groups) {
    const rank = (group) => {
      const key = group.join('/');
      const pos = ORDER.indexOf(key);
      if (pos >= 0) return pos;
      return Math.min(...group.map((c) => ORDER.indexOf(c)).filter((i) => i >= 0), 999);
    };
    return groups.sort((a, b) => rank(a) - rank(b)).map((group) => group.join('/'));
  }

  function normalizeDrugToComponents(drug) {
    const med = (typeof drug === 'string') ? { nombre: drug } : (drug || {});
    const text = [med.nombre, med.principio_activo, med.pauta].filter(Boolean).join(' ');
    const combinations = findCombinations(text);
    if (combinations.length) {
      const comboItems = combinations.map((combination) => ({ components: Array.from(new Set(tokenizePauta(combination))), pauta: combination, source: 'combination_exact' }));
      return comboItems.filter((item) => !comboItems.some((other) => other !== item && item.components.every((component) => other.components.includes(component))));
    }
    const components = Array.from(new Set(findSingleComponents(text)));
    return components.length ? [{ components, pauta: components.join('/'), source: 'single_components' }] : [];
  }

  function buildNormalizedRegimen(medicamentosSeleccionados) {
    const meds = Array.isArray(medicamentosSeleccionados) ? medicamentosSeleccionados : [];
    const groups = [];
    const matches = [];
    const unmatched = [];
    meds.forEach((med) => {
      const text = [med?.nombre, med?.principio_activo, med?.pauta].filter(Boolean).join(' ');
      const normalized = normalizeDrugToComponents(med);
      normalized.forEach((item) => {
        groups.push(item.components);
        matches.push({ nombre_mostrado: med?.nombre || med?.principio_activo || item.pauta, pauta_normalizada: item.pauta, origen_regla: item.source, componentes: item.components });
      });
      if (!normalized.length && String(text).trim()) unmatched.push(text);
    });
    const seen = new Set();
    const deduped = groups.filter((group) => {
      const key = group.join('/');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const pauta = orderGroups(deduped).join(' + ');
    return { pauta, reconocido: Boolean(pauta) && unmatched.length === 0, advertencia: !pauta || unmatched.length > 0, noReconocidos: unmatched, matches };
  }

  function normalizarPautaTAR(medicamentosSeleccionados) {
    return buildNormalizedRegimen(medicamentosSeleccionados);
  }

  function addCustomTarEntry({ texto_introducido, pauta_normalizada, componentes, tipo, sinonimos }) {
    const normalized = String(pauta_normalizada || '').trim();
    const introduced = String(texto_introducido || '').trim();
    if (!normalized || !introduced) throw new Error('Indique texto introducido y pauta normalizada.');
    const entries = getCustomDictionary().filter((e) => e.pauta_normalizada !== normalized);
    entries.push({
      nombre_mostrado: `${normalized} (manual)`, pauta_normalizada: normalized,
      componentes: Array.isArray(componentes) ? componentes : String(componentes || normalized).split(/[,+/]/).map((v) => v.trim()).filter(Boolean),
      tipo: tipo || 'Manual', sinonimos: Array.from(new Set([introduced, normalized, ...(sinonimos || [])].filter(Boolean))),
      origen: 'diccionario local personalizado', fecha_creacion: new Date().toISOString()
    });
    saveCustomDictionary(entries);
    return entries;
  }

  function classifyReason(reason) {
    const raw = String(reason || '').trim();
    const text = normalizeText(raw);
    if (!text) return { motivo_normalizado: '', motivo_detalle: '', motivo_original: raw, clasificado: false };
    if (/fracaso|virolog|viral|rebote|virem|resist|carga viral|no supresion|fallo/.test(text)) return { motivo_normalizado: 'Fracaso viral', motivo_detalle: '', motivo_original: raw, clasificado: true };
    if (/advers|toxic|intoler|renal|oseo|neuropsiquiatr|hepatic|rash|nause|diarrea|efecto|secundari/.test(text)) return { motivo_normalizado: 'Efectos secundarios', motivo_detalle: '', motivo_original: raw, clasificado: true };
    if (/interaccion|interacci|contraindic|farmaco|medicament/.test(text)) return { motivo_normalizado: 'Interacciones', motivo_detalle: '', motivo_original: raw, clasificado: true };
    if (/optim|simplific|biterapia|mejora|actualiz|comodidad|adherencia|switch|cambio proactivo|preferencia|pauta|reduccion/.test(text)) return { motivo_normalizado: 'Optimización', motivo_detalle: '', motivo_original: raw, clasificado: true };
    return { motivo_normalizado: 'Otros', motivo_detalle: raw, motivo_original: raw, clasificado: false };
  }

  function isCimaEnabled() { return localStorage.getItem(CIMA_ENABLED_KEY) !== 'false'; }
  function setCimaEnabled(enabled) { localStorage.setItem(CIMA_ENABLED_KEY, enabled ? 'true' : 'false'); }

  function scalarToText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
    if (Array.isArray(value)) return value.map(scalarToText).filter(Boolean).join(', ');
    if (typeof value === 'object') {
      return scalarToText(value.nombre || value.principioActivo || value.pactivo || value.descripcion || value.valor || value.name || '');
    }
    return '';
  }

  function mapCimaItem(item = {}) {
    const activeValue = item.pactivos || item.principiosActivos || item.principioActivo || '';
    return {
      nombre: scalarToText(item.nombre || item.nomMedicamento || item.descripcion),
      codigo_nacional: scalarToText(item.cn || item.codigoNacional || item.nregistro || item.nroRegistro),
      principio_activo: scalarToText(activeValue),
      forma_farmaceutica: scalarToText(item.formaFarmaceutica || item.forma),
      laboratorio: scalarToText(item.labtitular || item.laboratorio || item.titular),
      fuente: 'CIMA'
    };
  }

  async function buscarMedicamentoCIMA(text) {
    const query = String(text || '').trim();
    if (query.length < 3) return { results: [], message: 'Escriba al menos 3 caracteres para buscar en CIMA.' };
    const cacheKey = normalizeText(query);
    if (cimaSearchCache.has(cacheKey)) return cimaSearchCache.get(cacheKey);
    try {
      const response = await fetch(`https://cima.aemps.es/cima/rest/medicamentos?nombre=${encodeURIComponent(query)}&pagina=1`, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const items = Array.isArray(data.resultados) ? data.resultados : (Array.isArray(data) ? data : []);
      const result = { results: items.slice(0, 10).map(mapCimaItem).filter((item) => item.nombre || item.principio_activo), message: 'Resultados CIMA recibidos. Seleccione uno o use entrada manual si no aparece.' };
      cimaSearchCache.set(cacheKey, result);
      return result;
    } catch (error) {
      return { results: [], message: 'No se ha podido consultar CIMA. Puede introducir el medicamento manualmente.', error: error.message };
    }
  }

  const searchCIMA = buscarMedicamentoCIMA;

  window.CambiosNormalize = { MOTIVOS, BASE_TAR, normalizeText, allTarEntries, normalizeTar, normalizarPautaTAR, normalizeDrugToComponents, buildNormalizedRegimen, getCustomDictionary, saveCustomDictionary, addCustomTarEntry, classifyReason, isCimaEnabled, setCimaEnabled, buscarMedicamentoCIMA, searchCIMA, clearLocalNormalizationConfig };
}());
