(function () {
  const SETTING_KEY = 'cost_catalog_state_v1';
  const COLUMNS = ['codigo_tar', 'nombre_tar', 'componentes', 'coste_anual_eur', 'fecha_inicio_vigencia', 'fecha_fin_vigencia', 'observaciones'];
  const ALIAS_COLUMNS = ['alias', 'codigo_tar'];
  const NOTE = 'El catálogo de costes es gestionado localmente por el usuario. Los cálculos económicos son estimaciones orientativas basadas en el catálogo activo y no sustituyen a la contabilidad oficial del centro.';
  const EXAMPLE_CODE = 'EJEMPLO_BIC_FTC_TAF_BORRAR';

  function normalize(value) {
    return String(value || '')
      .trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*([/+\-])\s*/g, '$1')
      .replace(/[\s_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function compactKey(value) { return normalize(value).replace(/[\s/+\-]/g, ''); }
  function splitComponents(value) { return normalize(value).split(/[+/]/).map((p) => p.trim()).filter(Boolean).sort().join('/'); }
  function euro(value) { return typeof value === 'number' ? `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/año` : 'No disponible'; }
  function parseDate(value) { return window.CambiosIO?.toDateString(value) || ''; }
  function validDate(value) { return Boolean(value && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())); }
  function activeState() { return { catalog: [], aliases: [], batches: [], activeBatchId: '', importedAt: '', activeFilename: '', lastValidationStatus: '', lastValidationAt: '', lastValidationFilename: '', lastValidationErrors: [] }; }
  function isCurrent(row, today = new Date().toISOString().slice(0, 10)) { return row.fecha_inicio_vigencia <= today && (!row.fecha_fin_vigencia || today <= row.fecha_fin_vigencia); }

  async function loadState() {
    try { return { ...activeState(), ...((await window.CambiosStorage.loadSetting(SETTING_KEY)) || {}) }; } catch { return activeState(); }
  }
  async function saveState(state) { await window.CambiosStorage.saveSetting(SETTING_KEY, { ...activeState(), ...(state || {}) }); return state; }

  function templateXLSX() {
    const rows = [{ codigo_tar: 'BIC/FTC/TAF', nombre_tar: 'Bictegravir/emtricitabina/tenofovir alafenamida', componentes: 'BIC/FTC/TAF', coste_anual_eur: 6059, fecha_inicio_vigencia: '2020-01-01', fecha_fin_vigencia: '', observaciones: 'coste anual estimado. Para calcular históricos, use una fecha de inicio suficientemente antigua o deje fecha_fin_vigencia vacía si aplica hasta nueva actualización.' }, { codigo_tar: 'DTG/3TC', nombre_tar: 'Dolutegravir/Lamivudina', componentes: 'DTG/3TC', coste_anual_eur: 5117, fecha_inicio_vigencia: '2020-01-01', fecha_fin_vigencia: '', observaciones: 'Ejemplo de código corto recomendado.' }];
    const aliasRows = [{ alias: 'BIKTARVY', codigo_tar: 'BIC/FTC/TAF' }, { alias: 'DOVATO', codigo_tar: 'DTG/3TC' }, { alias: 'TRIUMEQ', codigo_tar: 'DTG/ABC/3TC' }, { alias: 'JULUCA', codigo_tar: 'DTG/RPV' }, { alias: 'SYMTUZA', codigo_tar: 'DRV/COBI/FTC/TAF' }];
    if (!window.XLSX) {
      const csv = [COLUMNS.join(';'), ...rows.map((row) => COLUMNS.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';')), '', 'Alias TAR', ALIAS_COLUMNS.join(';'), ...aliasRows.map((row) => ALIAS_COLUMNS.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
      return window.CambiosIO.downloadBlob(`\ufeff${csv}`, 'plantilla_costes_TAR.csv', 'text/csv;charset=utf-8');
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: COLUMNS }), 'Costes TAR');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aliasRows, { header: ALIAS_COLUMNS }), 'Alias TAR');
    XLSX.writeFile(wb, 'plantilla_costes_TAR.xlsx');
  }
  function costValue(raw) { return typeof raw === 'number' ? raw : Number(String(raw ?? '').trim().replace(',', '.')); }
  function err(fila, campo, valor, motivo, sugerencia) { return { fila, campo, valor_recibido: String(valor ?? ''), motivo, sugerencia }; }

  function validateAliases(rows = []) {
    return rows.map((row) => ({ alias: String(row.alias ?? row.Alias ?? '').trim(), codigo_tar: String(row.codigo_tar ?? row.Codigo_tar ?? row.codigo ?? '').trim() })).filter((r) => r.alias && r.codigo_tar);
  }

  function validateRows(rows, filename = '') {
    const errors = [], warnings = [], normalizedRows = [];
    const headers = Object.keys(rows[0] || {});
    const headerMap = Object.fromEntries(headers.map((h) => [normalize(h).replace(/ /g, '_'), h]));
    COLUMNS.forEach((col) => { if (!headerMap[col]) errors.push(err(1, col, '', `Falta la columna obligatoria ${col}`, 'Descargue la plantilla y respete los encabezados.')); });
    if (errors.length) return { valid: false, errors, warnings, rows: [], filename };
    rows.forEach((row, index) => {
      const fila = index + 2;
      if (!Object.values(row).some((v) => String(v ?? '').trim())) return;
      const item = Object.fromEntries(COLUMNS.map((col) => [col, row[headerMap[col]]]));
      item.codigo_tar = String(item.codigo_tar || '').trim(); item.nombre_tar = String(item.nombre_tar || '').trim(); item.componentes = String(item.componentes || '').trim(); item.observaciones = String(item.observaciones || '').trim();
      const rawCost = item.coste_anual_eur;
      item.coste_anual_eur = costValue(rawCost);
      const rawStart = item.fecha_inicio_vigencia, rawEnd = item.fecha_fin_vigencia;
      item.fecha_inicio_vigencia = parseDate(rawStart); item.fecha_fin_vigencia = parseDate(rawEnd);
      if (item.codigo_tar === EXAMPLE_CODE || /fila de ejemplo/i.test(item.observaciones)) warnings.push(err(fila, 'codigo_tar', item.codigo_tar, 'Parece conservar la fila de ejemplo de la plantilla.', 'Elimine la fila de ejemplo antes de importar costes reales.'));
      if (!item.codigo_tar) errors.push(err(fila, 'codigo_tar', row[headerMap.codigo_tar], 'codigo_tar no puede estar vacío', 'Indique un código estable para la pauta TAR.'));
      if (!item.nombre_tar) errors.push(err(fila, 'nombre_tar', row[headerMap.nombre_tar], 'nombre_tar no puede estar vacío', 'Indique el nombre comercial o descripción de la pauta.'));
      if (!Number.isFinite(item.coste_anual_eur) || item.coste_anual_eur < 0) errors.push(err(fila, 'coste_anual_eur', rawCost, 'El coste debe ser numérico y mayor o igual que 0', 'Use 6200 o 6200.00, sin texto ni símbolo €.'));
      if (!validDate(item.fecha_inicio_vigencia)) errors.push(err(fila, 'fecha_inicio_vigencia', rawStart, 'Fecha de inicio inválida u obligatoria', 'Use formato AAAA-MM-DD.'));
      if (rawEnd && !validDate(item.fecha_fin_vigencia)) errors.push(err(fila, 'fecha_fin_vigencia', rawEnd, 'Fecha fin inválida', 'Déjela vacía o use formato AAAA-MM-DD.'));
      if (item.fecha_fin_vigencia && item.fecha_inicio_vigencia && item.fecha_fin_vigencia < item.fecha_inicio_vigencia) errors.push(err(fila, 'fecha_fin_vigencia', rawEnd, 'Fecha fin anterior a fecha inicio', 'La fecha fin debe ser igual o posterior a la fecha inicio.'));
      normalizedRows.push({ ...item, id: `cost-${Date.now()}-${index}`, import_batch_id: '', created_at: new Date().toISOString(), _fila: fila });
    });
    const byCode = new Map();
    normalizedRows.forEach((r) => { const dupKey = `${normalize(r.codigo_tar)}|${r.fecha_inicio_vigencia}`; if (byCode.has(dupKey)) errors.push(err(r._fila, 'codigo_tar', r.codigo_tar, 'Duplicado exacto de codigo_tar con la misma fecha_inicio_vigencia', 'Mantenga solo una fila por código e inicio de vigencia.')); byCode.set(dupKey, r); });
    Object.values(normalizedRows.reduce((a, r) => ((a[normalize(r.codigo_tar)] ||= []).push(r), a), {})).forEach((items) => {
      items.sort((a, b) => a.fecha_inicio_vigencia.localeCompare(b.fecha_inicio_vigencia));
      for (let i = 1; i < items.length; i += 1) if (!items[i - 1].fecha_fin_vigencia || items[i].fecha_inicio_vigencia <= items[i - 1].fecha_fin_vigencia) errors.push(err(items[i]._fila, 'vigencia', items[i].codigo_tar, `Solapamiento de vigencias para ${items[i].codigo_tar}`, 'Ajuste fecha_fin_vigencia de la versión anterior o fecha_inicio_vigencia de la nueva.'));
    });
    return { valid: errors.length === 0, errors, warnings, rows: normalizedRows, filename };
  }

  async function recordFailedValidation(result, filename) {
    const now = new Date().toISOString(); const batchId = `cost-failed-${now.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
    const state = await loadState();
    state.lastValidationStatus = 'failed'; state.lastValidationAt = now; state.lastValidationFilename = filename || ''; state.lastValidationErrors = result.errors || [];
    state.batches = [...(state.batches || []), { id: batchId, imported_at: now, filename: filename || '', rows_imported: 0, status: 'fallido', errors: (result.errors || []).length, notes: (result.errors || []).slice(0, 5).map((e) => `${e.fila}:${e.campo} ${e.motivo}`).join(' | ') }];
    await saveState(state); return state;
  }

  async function importRows(rows, filename, aliases = []) {
    const result = validateRows(rows, filename);
    if (!result.valid) { await recordFailedValidation(result, filename); return result; }
    const now = new Date().toISOString(); const batchId = `cost-${now.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
    const catalog = result.rows.map(({ _fila, ...r }) => ({ ...r, import_batch_id: batchId, created_at: now }));
    const normalizedAliases = validateAliases(aliases).map((a) => ({ ...a, alias_normalizado: normalize(a.alias), codigo_tar_normalizado: normalize(a.codigo_tar), import_batch_id: batchId }));
    const state = await loadState();
    state.batches = (state.batches || []).map((b) => b.status === 'activo' ? { ...b, status: 'reemplazado' } : b);
    state.catalog = catalog; state.aliases = normalizedAliases; state.activeBatchId = batchId; state.importedAt = now; state.activeFilename = filename || ''; state.lastValidationStatus = 'success'; state.lastValidationAt = now; state.lastValidationFilename = filename || ''; state.lastValidationErrors = [];
    state.batches = [...state.batches, { id: batchId, imported_at: now, filename: filename || '', rows_imported: catalog.length, status: 'activo', errors: 0, notes: '' }];
    await saveState(state); return { ...result, batchId, importedAt: now, rowsImported: catalog.length };
  }
  async function clearActiveCatalog() {
    const now = new Date().toISOString(); const state = await loadState();
    const old = state.activeBatchId;
    state.batches = (state.batches || []).map((b) => b.id === old && b.status === 'activo' ? { ...b, status: 'eliminado', deleted_at: now } : b);
    state.catalog = []; state.aliases = []; state.activeBatchId = ''; state.importedAt = ''; state.activeFilename = ''; await saveState(state); return state;
  }
  function exportActiveCatalog(state) { const rows = ((state || {}).catalog || []).map((r) => Object.fromEntries(COLUMNS.map((c) => [c, r[c] ?? '']))); if (window.XLSX) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: COLUMNS }), 'Costes TAR'); XLSX.writeFile(wb, 'catalogo_costes_TAR_activo.xlsx'); } else window.CambiosIO.exportCSV(rows, 'catalogo_costes_TAR_activo.csv'); }

  function findCost(tar, date, catalog, aliases = []) {
    const key = normalize(tar); if (!key) return { found: false, code: 'tar_no_encontrado', reason: 'TAR vacío', tar, normalized: key, search: 'vacío' };
    const alias = aliases.find((a) => normalize(a.alias) === key || compactKey(a.alias) === compactKey(key));
    const keys = alias ? [normalize(alias.codigo_tar)] : [key];
    const componentKey = splitComponents(key); const compact = compactKey(key);
    const candidates = catalog.filter((c) => keys.includes(normalize(c.codigo_tar)) || (!alias && (normalize(c.componentes) === key || normalize(c.nombre_tar) === key || splitComponents(c.componentes) === componentKey || compactKey(c.codigo_tar) === compact || compactKey(c.componentes) === compact)));
    if (!candidates.length) return { found: false, code: 'tar_no_encontrado', reason: 'TAR no encontrado en catálogo', tar, normalized: key, search: alias ? `alias→${alias.codigo_tar}` : 'codigo_tar/componentes/nombre_tar' };
    const active = candidates.filter((c) => c.fecha_inicio_vigencia <= date && (!c.fecha_fin_vigencia || date <= c.fecha_fin_vigencia));
    if (active.length !== 1) return { found: false, code: active.length > 1 ? 'coste_duplicado_o_solapado' : 'sin_coste_vigente', reason: active.length > 1 ? 'coste_duplicado_o_solapado' : 'sin_coste_vigente_para_fecha_cambio', tar, normalized: key, search: `${candidates.length} candidato(s), ${active.length} vigente(s)` };
    return { found: true, cost: active[0], normalized: key, search: alias ? `alias→${alias.codigo_tar}` : 'coincidencia catálogo' };
  }
  function noCalc(record, state, old, newer, code) { return { coste_anual_tar_anterior_eur: '', coste_anual_tar_nuevo_eur: '', diferencia_anual_eur: '', impacto_economico: 'no_calculable', coste_calculable: 'no', version_catalogo_costes: state?.activeBatchId || '', fecha_importacion_catalogo_costes: state?.importedAt || '', missing_old: old?.found ? '' : (old?.tar || record.tar_antiguo_normalizado || record.tar_antiguo_original || ''), missing_new: newer?.found ? '' : (newer?.tar || record.tar_nuevo_normalizado || record.tar_nuevo_original || ''), error_coste: code, motivo_no_calculable: code, tar_anterior_normalizado_coste: old?.normalized || normalize(record.tar_antiguo_normalizado || record.tar_antiguo || record.tar_antiguo_original), tar_nuevo_normalizado_coste: newer?.normalized || normalize(record.tar_nuevo_normalizado || record.tar_nuevo || record.tar_nuevo_original), resultado_busqueda_tar_anterior: old?.found ? 'encontrado' : (old?.reason || ''), resultado_busqueda_tar_nuevo: newer?.found ? 'encontrado' : (newer?.reason || '') }; }
  function calculate(record, state) { const catalog = state?.catalog || []; const aliases = state?.aliases || []; const date = record.fecha || ''; if (!catalog.length || !state?.activeBatchId) return noCalc(record, state, null, null, 'catalogo_no_activo'); if (!date) return noCalc(record, state, null, null, 'fecha_cambio_no_disponible'); const old = findCost(record.tar_antiguo_normalizado || record.tar_antiguo || record.tar_antiguo_original, date, catalog, aliases); const newer = findCost(record.tar_nuevo_normalizado || record.tar_nuevo || record.tar_nuevo_original, date, catalog, aliases); if (!old.found || !newer.found) { let code = !old.found && !newer.found ? 'ambos_tar_no_encontrados' : (!old.found ? 'tar_anterior_no_encontrado' : 'tar_nuevo_no_encontrado'); if (old.code === 'sin_coste_vigente' && newer.code === 'sin_coste_vigente') code = 'sin_coste_vigente_para_fecha_cambio'; else if (old.code === 'sin_coste_vigente') code = 'sin_coste_vigente_tar_anterior'; else if (newer.code === 'sin_coste_vigente') code = 'sin_coste_vigente_tar_nuevo'; if (old.code === 'coste_duplicado_o_solapado' || newer.code === 'coste_duplicado_o_solapado') code = 'coste_duplicado_o_solapado'; return noCalc(record, state, old, newer, code); } const diff = Number(old.cost.coste_anual_eur) - Number(newer.cost.coste_anual_eur); return { coste_anual_tar_anterior_eur: Number(old.cost.coste_anual_eur), coste_anual_tar_nuevo_eur: Number(newer.cost.coste_anual_eur), diferencia_anual_eur: diff, impacto_economico: diff > 0 ? 'ahorro' : diff < 0 ? 'sobrecoste' : 'neutro', coste_calculable: 'si', version_catalogo_costes: state.activeBatchId || old.cost.import_batch_id || '', fecha_importacion_catalogo_costes: state.importedAt || '', motivo_no_calculable: '', tar_anterior_normalizado_coste: old.normalized, tar_nuevo_normalizado_coste: newer.normalized, resultado_busqueda_tar_anterior: old.search, resultado_busqueda_tar_nuevo: newer.search }; }
  function enrichRecords(records, state) { return (records || []).map((r) => ({ ...r, impacto_coste: calculate(r, state) })); }
  function publicCostColumns(record, state) { const c = record.impacto_coste || calculate(record, state || {}); return { coste_anual_tar_anterior_eur: c.coste_anual_tar_anterior_eur, coste_anual_tar_nuevo_eur: c.coste_anual_tar_nuevo_eur, diferencia_anual_eur: c.diferencia_anual_eur, impacto_economico: c.impacto_economico, coste_calculable: c.coste_calculable, version_catalogo_costes: c.version_catalogo_costes, fecha_importacion_catalogo_costes: c.fecha_importacion_catalogo_costes }; }
  window.CambiosCosts = { COLUMNS, ALIAS_COLUMNS, NOTE, normalize, compactKey, validateAliases, findCost, euro, loadState, saveState, templateXLSX, validateRows, importRows, clearActiveCatalog, exportActiveCatalog, isCurrent, calculate, enrichRecords, publicCostColumns };
}());


(function () {
  const chartRefs = {};
  function destroy(id) { if (chartRefs[id]) { chartRefs[id].destroy(); delete chartRefs[id]; } }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>\"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[ch])); }
  function table(rows) {
    const headers = Object.keys(rows[0] || {});
    if (!headers.length) return '<p class="small muted">Sin datos.</p>';
    return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td>${escapeHtml(r[h])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function aggregate(records, keyFn) {
    const map = new Map();
    records.forEach((r) => { const key = keyFn(r) || 'Sin fecha'; const c = r.impacto_coste || {}; const row = map.get(key) || { periodo: key, cambios: 0, calculables: 0, no_calculables: 0, ahorro_anual_estimado: 0, sobrecoste_anual_estimado: 0, balance_neto_anual_estimado: 0 }; row.cambios += 1; if (c.coste_calculable === 'si') { row.calculables += 1; const d = Number(c.diferencia_anual_eur) || 0; if (d > 0) row.ahorro_anual_estimado += d; if (d < 0) row.sobrecoste_anual_estimado += Math.abs(d); row.balance_neto_anual_estimado += d; } else row.no_calculables += 1; map.set(key, row); });
    return Array.from(map.values()).sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
  }
  function cumulative(monthly) { let balance = 0, ahorro = 0, sobrecoste = 0, calculables = 0; return monthly.map((m) => { balance += m.balance_neto_anual_estimado; ahorro += m.ahorro_anual_estimado; sobrecoste += m.sobrecoste_anual_estimado; calculables += m.calculables; return { periodo: m.periodo, balance_economico_acumulado: balance, ahorro_acumulado: ahorro, sobrecoste_acumulado: sobrecoste, cambios_calculables_acumulados: calculables }; }); }
  function impactRows(records) { return records.map((r) => ({ fecha: r.fecha, patient_id: r.patient_id, tar_anterior: r.tar_antiguo_normalizado || r.tar_antiguo, tar_nuevo: r.tar_nuevo_normalizado || r.tar_nuevo, motivo: r.motivo_normalizado, ...window.CambiosCosts.publicCostColumns(r, window.CambiosCostsState || {}) })); }
  function suggestion(code) { if (String(code).includes('no_encontrado')) return 'Añada este TAR al catálogo o cree un alias equivalente.'; if (String(code).includes('sin_coste_vigente')) return 'Amplíe la fecha de inicio/fin de vigencia del coste en el Excel.'; if (code === 'catalogo_no_activo') return 'Guarde un catálogo validado como catálogo activo.'; if (code === 'fecha_cambio_no_disponible') return 'Revise que el cambio TAR tenga fecha válida.'; return 'Revise el diagnóstico del catálogo y del registro.'; }
  function missingRows(records) { return records.filter((r) => r.impacto_coste?.coste_calculable !== 'si').map((r) => ({ id_cambio: r.id || '', fecha_cambio: r.fecha || '', tar_anterior_registrado: r.tar_antiguo_original || r.tar_antiguo || '', tar_nuevo_registrado: r.tar_nuevo_original || r.tar_nuevo || '', tar_anterior_normalizado: r.impacto_coste?.tar_anterior_normalizado_coste || '', tar_nuevo_normalizado: r.impacto_coste?.tar_nuevo_normalizado_coste || '', resultado_busqueda_tar_anterior: r.impacto_coste?.resultado_busqueda_tar_anterior || '', resultado_busqueda_tar_nuevo: r.impacto_coste?.resultado_busqueda_tar_nuevo || '', motivo_no_calculable: r.impacto_coste?.motivo_no_calculable || r.impacto_coste?.error_coste || '', sugerencia: suggestion(r.impacto_coste?.motivo_no_calculable || r.impacto_coste?.error_coste) })); }
  function notFoundExportRows(records) { const map = new Map(); records.filter((r) => r.impacto_coste?.coste_calculable !== 'si').forEach((r) => [['old', r.impacto_coste?.missing_old, r.fecha], ['new', r.impacto_coste?.missing_new, r.fecha]].forEach(([side, value, fecha]) => { if (!value) return; const normalized = window.CambiosCosts.normalize(value); const item = map.get(normalized) || { valor_original_tar: value, valor_normalizado: normalized, aparece_como_tar_anterior: 'no', aparece_como_tar_nuevo: 'no', frecuencia: 0, primera_fecha_detectada: fecha || '', ultima_fecha_detectada: fecha || '', sugerencia: 'Añada este TAR al catálogo o cree un alias equivalente.' }; item.frecuencia += 1; if (side === 'old') item.aparece_como_tar_anterior = 'si'; else item.aparece_como_tar_nuevo = 'si'; if (fecha && (!item.primera_fecha_detectada || fecha < item.primera_fecha_detectada)) item.primera_fecha_detectada = fecha; if (fecha && (!item.ultima_fecha_detectada || fecha > item.ultima_fecha_detectada)) item.ultima_fecha_detectada = fecha; map.set(normalized, item); })); return Array.from(map.values()); }
  function summary(records) { const diffs = records.map((r) => r.impacto_coste).filter((c) => c?.coste_calculable === 'si').map((c) => Number(c.diferencia_anual_eur) || 0).sort((a, b) => a - b); const total = records.length, calculables = diffs.length, noCalc = total - calculables; const ahorro = diffs.filter((d) => d > 0).reduce((a, b) => a + b, 0), sobre = Math.abs(diffs.filter((d) => d < 0).reduce((a, b) => a + b, 0)), balance = diffs.reduce((a, b) => a + b, 0); const mediana = diffs.length ? (diffs[Math.floor((diffs.length - 1) / 2)] + diffs[Math.ceil((diffs.length - 1) / 2)]) / 2 : 0; return { total, calculables, noCalc, pct: total ? (calculables * 100 / total) : 0, ahorro, sobre, balance, media: calculables ? balance / calculables : 0, mediana }; }
  function filtered(records) { const $ = (id) => document.getElementById(id); const from = $('cost-filter-from')?.value || '', to = $('cost-filter-to')?.value || '', year = $('cost-filter-year')?.value || '', month = $('cost-filter-month')?.value || '', reason = $('cost-filter-reason')?.value || '', type = $('cost-filter-type')?.value || ''; const old = ($('cost-filter-old')?.value || '').toLowerCase(), newer = ($('cost-filter-new')?.value || '').toLowerCase(); return records.filter((r) => (!from || r.fecha >= from) && (!to || r.fecha <= to) && (!year || String(r.anio) === year) && (!month || String(r.mes) === month) && (!reason || r.motivo_normalizado === reason) && (!old || String(r.tar_antiguo_normalizado || r.tar_antiguo || '').toLowerCase().includes(old)) && (!newer || String(r.tar_nuevo_normalizado || r.tar_nuevo || '').toLowerCase().includes(newer)) && (!type || r.impacto_coste?.impacto_economico === type)); }
  function renderCharts(monthly, annual, accum) { if (!window.Chart) return; [['chart-cost-monthly', monthly, 'balance_neto_anual_estimado'], ['chart-cost-annual', annual, 'balance_neto_anual_estimado'], ['chart-cost-cumulative', accum, 'balance_economico_acumulado']].forEach(([id, rows, valueKey]) => { const canvas = document.getElementById(id); if (!canvas) return; destroy(id); chartRefs[id] = new Chart(canvas, { type: id.includes('cumulative') ? 'line' : 'bar', data: { labels: rows.map((r) => r.periodo), datasets: [{ label: '€', data: rows.map((r) => r[valueKey]), backgroundColor: '#0f766e', borderColor: '#075985', borderWidth: 2, tension: 0.3 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); }); }
  function exportRows(rows, filename) { if (window.XLSX) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Datos'); XLSX.writeFile(wb, filename); } else window.CambiosIO.exportCSV(rows, filename.replace(/\.xlsx$/i, '.csv')); }
  function renderCatalogAdmin(state) {
    const $ = (id) => document.getElementById(id); const catalog = state.catalog || []; const today = new Date().toISOString().slice(0, 10); const hasActive = catalog.length > 0 && Boolean(state.activeBatchId); const current = catalog.filter((c) => window.CambiosCosts.isCurrent(c, today)); const ended = catalog.filter((c) => c.fecha_fin_vigencia); const lastFailed = state.lastValidationStatus === 'failed';
    if ($('cost-catalog-status')) $('cost-catalog-status').innerHTML = `<div class="alert ${hasActive ? 'info' : 'warning'}"><strong>Estado:</strong> ${lastFailed ? 'último intento de importación fallido' : (hasActive ? 'Catálogo activo cargado correctamente. El dashboard económico se ha recalculado.' : (state.lastValidationStatus === 'success_preview' ? 'Catálogo validado pendiente de guardar.' : 'sin catálogo activo'))}. ${!hasActive ? 'No hay ningún catálogo de costes activo. Descargue la plantilla, cumpliméntela y suba un archivo válido.' : ''} ${lastFailed ? 'El último archivo validado contiene errores críticos y no ha sustituido al catálogo activo.' : ''}</div>`;
    if ($('cost-catalog-summary')) $('cost-catalog-summary').innerHTML = [['Catálogo activo', hasActive ? 'sí' : 'no'], ['Fecha de importación', state.importedAt || 'Sin catálogo'], ['Nombre del archivo', state.activeFilename || 'Sin catálogo'], ['Número de filas importadas', catalog.length], ['Número de tratamientos únicos', new Set(catalog.map((c) => c.codigo_tar)).size], ['Alias TAR importados', (state.aliases || []).length], ['Versión o lote activo', state.activeBatchId || 'Sin catálogo'], ['Tratamientos vigentes actualmente', current.length], ['Tratamientos con fecha fin de vigencia', ended.length]].map(([l,v])=>`<div class="metric"><span>${escapeHtml(l)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
    if ($('download-active-cost-catalog-btn')) $('download-active-cost-catalog-btn').disabled = !hasActive; if ($('delete-active-cost-catalog-btn')) $('delete-active-cost-catalog-btn').disabled = !hasActive;
    const text = (($('catalog-filter-text')?.value || '')).toLowerCase(); const status = $('catalog-filter-status')?.value || '';
    const visible = catalog.filter((r) => (!text || [r.codigo_tar, r.nombre_tar, r.componentes].some((v) => String(v || '').toLowerCase().includes(text))) && (!status || (status === 'vigentes' ? window.CambiosCosts.isCurrent(r, today) : !window.CambiosCosts.isCurrent(r, today)))).map((r) => ({ codigo_tar: r.codigo_tar, nombre_tar: r.nombre_tar, componentes: r.componentes, coste_anual_eur: r.coste_anual_eur, fecha_inicio_vigencia: r.fecha_inicio_vigencia, fecha_fin_vigencia: r.fecha_fin_vigencia, observaciones: r.observaciones, import_batch_id: r.import_batch_id, created_at: r.created_at }));
    if ($('active-cost-catalog-table')) $('active-cost-catalog-table').innerHTML = hasActive ? table(visible) : '<p class="small muted">Sin catálogo activo.</p>';
    const history = (state.batches || []).slice().reverse().map((b) => ({ import_batch_id: b.id, fecha_hora_importacion: b.imported_at, filename: b.filename, numero_filas_importadas: b.rows_imported, estado: b.status, errores_detectados: b.errors || 0, resumen: b.notes || '' }));
    if ($('cost-catalog-history')) $('cost-catalog-history').innerHTML = table(history);
  }
  function render(records, state) {
    window.CambiosCostsState = state || window.CambiosCostsState || {}; const enriched = window.CambiosCosts.enrichRecords(records || [], window.CambiosCostsState); const $ = (id) => document.getElementById(id); if ($('cost-note')) $('cost-note').textContent = (window.CambiosCostsState.catalog || []).length ? window.CambiosCosts.NOTE : 'No hay catálogo de costes activo. El impacto económico no puede calcularse.';
    renderCatalogAdmin(window.CambiosCostsState);
    ['cost-filter-year','cost-filter-month','cost-filter-reason'].forEach((id) => { const el=$(id); if (!el) return; const old=el.value; const vals = id.includes('year') ? Array.from(new Set(enriched.map(r=>r.anio).filter(Boolean))).sort() : id.includes('month') ? Array.from({length:12},(_,i)=>i+1) : (window.CambiosNormalize?.MOTIVOS || []); el.innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(''); el.value=old; });
    const rows = filtered(enriched); const monthly = aggregate(rows, (r) => r.fecha ? `${r.anio}-${String(r.mes).padStart(2,'0')}` : 'Sin fecha'); const annual = aggregate(rows, (r) => r.anio || 'Sin fecha').map((r) => ({ ...r, promedio_impacto_calculable: r.calculables ? r.balance_neto_anual_estimado / r.calculables : 0 })); const accum = cumulative(monthly); const missing = missingRows(rows); const s = summary(rows); window.CambiosEconomicRows = { impact: impactRows(rows), monthly, annual, cumulative: accum, missing, notFound: notFoundExportRows(rows) };
    if ($('cost-dashboard-cards')) $('cost-dashboard-cards').innerHTML = [['Total cambios', s.total], ['Calculables', s.calculables], ['No calculables', s.noCalc], ['% calculables', `${s.pct.toFixed(1)}%`], ['Ahorro anual total', window.CambiosCosts.euro(s.ahorro)], ['Sobrecoste anual total', window.CambiosCosts.euro(s.sobre)], ['Balance neto anual', window.CambiosCosts.euro(s.balance)], ['Media por cambio', window.CambiosCosts.euro(s.media)], ['Mediana por cambio', window.CambiosCosts.euro(s.mediana)]].map(([l,v])=>`<div class="metric"><span>${escapeHtml(l)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
    if ($('cost-note') && (window.CambiosCostsState.catalog || []).length && s.total > 0 && s.calculables === 0) $('cost-note').textContent = 'El catálogo está activo, pero ningún cambio TAR ha podido emparejarse. Revise el diagnóstico de no calculables. Es probable que los nombres/códigos de TAR del histórico no coincidan con los del catálogo o que no haya costes vigentes para las fechas de cambio.';
    if ($('cost-impact-table')) $('cost-impact-table').innerHTML = table(window.CambiosEconomicRows.impact); if ($('cost-monthly-table')) $('cost-monthly-table').innerHTML = table(monthly); if ($('cost-annual-table')) $('cost-annual-table').innerHTML = table(annual); if ($('cost-cumulative-table')) $('cost-cumulative-table').innerHTML = table(accum); if ($('cost-missing-table')) $('cost-missing-table').innerHTML = table(missing); renderCharts(monthly, annual, accum);
  }
  async function readAndValidate(file) { const result = await window.CambiosIO.readExcelWorkbook(file); const costSheet = result.sheets.find((s) => window.CambiosCosts.normalize(s.name) === 'costes tar') || result.sheets.find((s) => s.rows.length) || { rows: [] }; const aliasSheet = result.sheets.find((s) => window.CambiosCosts.normalize(s.name) === 'alias tar') || { rows: [] }; const validation = window.CambiosCosts.validateRows(costSheet.rows, file?.name || ''); validation.aliases = window.CambiosCosts.validateAliases(aliasSheet.rows); return validation; }
  window.CambiosCostsUI = { render, readAndValidate, exportRows };
}());
