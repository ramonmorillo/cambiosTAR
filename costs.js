(function () {
  const SETTING_KEY = 'cost_catalog_state_v1';
  const COLUMNS = ['codigo_tar', 'nombre_tar', 'componentes', 'coste_anual_eur', 'fecha_inicio_vigencia', 'fecha_fin_vigencia', 'observaciones'];
  const NOTE = 'Cálculo económico estimado a partir del catálogo de costes TAR cargado por el usuario. No sustituye a la contabilidad oficial ni a los sistemas de información económica del centro.';

  function normalize(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s/_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function euro(value) { return typeof value === 'number' ? `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/año` : 'No disponible'; }
  function parseDate(value) { return window.CambiosIO?.toDateString(value) || ''; }
  function validDate(value) { return Boolean(value && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())); }
  function activeState() { return { catalog: [], batches: [], activeBatchId: '', importedAt: '' }; }

  async function loadState() {
    try { return { ...activeState(), ...((await window.CambiosStorage.loadSetting(SETTING_KEY)) || {}) }; } catch { return activeState(); }
  }
  async function saveState(state) { await window.CambiosStorage.saveSetting(SETTING_KEY, state); return state; }

  function templateXLSX() {
    const rows = [{ codigo_tar: 'EJEMPLO_BIC_FTC_TAF_BORRAR', nombre_tar: 'Ejemplo: Bictegravir/emtricitabina/tenofovir alafenamida', componentes: 'BIC/FTC/TAF', coste_anual_eur: 0, fecha_inicio_vigencia: '2026-01-01', fecha_fin_vigencia: '', observaciones: 'Fila de ejemplo: borrar antes de importar costes reales' }];
    if (!window.XLSX) {
      const csv = [COLUMNS.join(';'), ...rows.map((row) => COLUMNS.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
      return window.CambiosIO.downloadBlob(`\ufeff${csv}`, 'plantilla_costes_TAR.csv', 'text/csv;charset=utf-8');
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: COLUMNS }), 'Costes TAR');
    XLSX.writeFile(wb, 'plantilla_costes_TAR.xlsx');
  }

  function validateRows(rows, filename = '') {
    const errors = [];
    const normalizedRows = [];
    const headers = Object.keys(rows[0] || {});
    const headerMap = Object.fromEntries(headers.map((h) => [normalize(h).replace(/ /g, '_'), h]));
    COLUMNS.forEach((col) => { if (!headerMap[col]) errors.push({ fila: 1, campo: col, motivo: `Falta la columna obligatoria ${col}` }); });
    if (errors.length) return { valid: false, errors, rows: [] };
    rows.forEach((row, index) => {
      const fila = index + 2;
      if (!Object.values(row).some((v) => String(v ?? '').trim())) return;
      const item = Object.fromEntries(COLUMNS.map((col) => [col, row[headerMap[col]]]));
      item.codigo_tar = String(item.codigo_tar || '').trim(); item.nombre_tar = String(item.nombre_tar || '').trim(); item.componentes = String(item.componentes || '').trim(); item.observaciones = String(item.observaciones || '').trim();
      item.coste_anual_eur = typeof item.coste_anual_eur === 'number' ? item.coste_anual_eur : Number(String(item.coste_anual_eur || '').replace(',', '.'));
      item.fecha_inicio_vigencia = parseDate(item.fecha_inicio_vigencia); item.fecha_fin_vigencia = parseDate(item.fecha_fin_vigencia);
      if (!item.codigo_tar) errors.push({ fila, campo: 'codigo_tar', motivo: 'codigo_tar no puede estar vacío' });
      if (!item.nombre_tar) errors.push({ fila, campo: 'nombre_tar', motivo: 'nombre_tar no puede estar vacío' });
      if (!Number.isFinite(item.coste_anual_eur) || item.coste_anual_eur < 0) errors.push({ fila, campo: 'coste_anual_eur', motivo: 'Debe ser numérico y mayor o igual que 0' });
      if (!validDate(item.fecha_inicio_vigencia)) errors.push({ fila, campo: 'fecha_inicio_vigencia', motivo: 'Fecha de inicio inválida' });
      if (item.fecha_fin_vigencia && !validDate(item.fecha_fin_vigencia)) errors.push({ fila, campo: 'fecha_fin_vigencia', motivo: 'Fecha fin inválida' });
      if (item.fecha_fin_vigencia && item.fecha_inicio_vigencia && item.fecha_fin_vigencia < item.fecha_inicio_vigencia) errors.push({ fila, campo: 'fecha_fin_vigencia', motivo: 'Fecha fin anterior a fecha inicio' });
      normalizedRows.push({ ...item, id: `cost-${Date.now()}-${index}`, import_batch_id: '', created_at: new Date().toISOString(), _fila: fila });
    });
    const byCode = new Map();
    normalizedRows.forEach((r) => {
      const dupKey = `${normalize(r.codigo_tar)}|${r.fecha_inicio_vigencia}`;
      if (byCode.has(dupKey)) errors.push({ fila: r._fila, campo: 'codigo_tar', motivo: 'Duplicado exacto de codigo_tar con la misma fecha_inicio_vigencia' });
      byCode.set(dupKey, r);
    });
    Object.values(Object.groupBy ? Object.groupBy(normalizedRows, (r) => normalize(r.codigo_tar)) : normalizedRows.reduce((a, r) => ((a[normalize(r.codigo_tar)] ||= []).push(r), a), {})).forEach((items) => {
      items.sort((a, b) => a.fecha_inicio_vigencia.localeCompare(b.fecha_inicio_vigencia));
      for (let i = 1; i < items.length; i += 1) if (!items[i - 1].fecha_fin_vigencia || items[i].fecha_inicio_vigencia <= items[i - 1].fecha_fin_vigencia) errors.push({ fila: items[i]._fila, campo: 'vigencia', motivo: `Solapamiento de vigencias para ${items[i].codigo_tar}` });
    });
    return { valid: errors.length === 0, errors, rows: normalizedRows, filename };
  }

  async function importRows(rows, filename) {
    const result = validateRows(rows, filename);
    if (!result.valid) return result;
    const now = new Date().toISOString(); const batchId = `cost-${now.replace(/[-:.TZ]/g, '').slice(0, 14)}`;
    const catalog = result.rows.map(({ _fila, ...r }) => ({ ...r, import_batch_id: batchId, created_at: now }));
    const state = await loadState();
    state.catalog = catalog; state.activeBatchId = batchId; state.importedAt = now;
    state.batches = [...(state.batches || []), { id: batchId, imported_at: now, filename: filename || '', rows_imported: catalog.length, status: 'activo', notes: '' }];
    await saveState(state);
    return { ...result, batchId, importedAt: now, rowsImported: catalog.length };
  }

  function findCost(tar, date, catalog) {
    const key = normalize(tar); if (!key) return { found: false, reason: 'TAR vacío' };
    const candidates = catalog.filter((c) => [c.codigo_tar, c.nombre_tar, c.componentes].some((v) => normalize(v) === key));
    if (!candidates.length) return { found: false, reason: 'TAR no encontrado en catálogo', tar };
    const active = candidates.filter((c) => c.fecha_inicio_vigencia <= date && (!c.fecha_fin_vigencia || date <= c.fecha_fin_vigencia));
    if (active.length !== 1) return { found: false, reason: active.length > 1 ? 'Duplicidad de coste vigente' : 'Sin coste vigente en la fecha', tar };
    return { found: true, cost: active[0] };
  }
  function calculate(record, state) {
    const catalog = state?.catalog || []; const date = record.fecha || new Date().toISOString().slice(0, 10);
    const old = findCost(record.tar_antiguo_normalizado || record.tar_antiguo || record.tar_antiguo_original, date, catalog);
    const newer = findCost(record.tar_nuevo_normalizado || record.tar_nuevo || record.tar_nuevo_original, date, catalog);
    if (!old.found || !newer.found) return { coste_anual_tar_anterior_eur: '', coste_anual_tar_nuevo_eur: '', diferencia_anual_eur: '', impacto_economico: 'no_calculable', coste_calculable: 'no', version_catalogo_costes: state?.activeBatchId || '', fecha_importacion_catalogo_costes: state?.importedAt || '', missing_old: old.found ? '' : (old.tar || record.tar_antiguo_normalizado || record.tar_antiguo_original || ''), missing_new: newer.found ? '' : (newer.tar || record.tar_nuevo_normalizado || record.tar_nuevo_original || ''), error_coste: [old.found ? '' : old.reason, newer.found ? '' : newer.reason].filter(Boolean).join('; ') };
    const diff = Number(old.cost.coste_anual_eur) - Number(newer.cost.coste_anual_eur);
    return { coste_anual_tar_anterior_eur: Number(old.cost.coste_anual_eur), coste_anual_tar_nuevo_eur: Number(newer.cost.coste_anual_eur), diferencia_anual_eur: diff, impacto_economico: diff > 0 ? 'ahorro' : diff < 0 ? 'sobrecoste' : 'neutro', coste_calculable: 'si', version_catalogo_costes: state.activeBatchId || old.cost.import_batch_id || '', fecha_importacion_catalogo_costes: state.importedAt || '' };
  }
  function enrichRecords(records, state) { return (records || []).map((r) => ({ ...r, impacto_coste: calculate(r, state) })); }
  function publicCostColumns(record, state) { const c = record.impacto_coste || calculate(record, state || {}); return { coste_anual_tar_anterior_eur: c.coste_anual_tar_anterior_eur, coste_anual_tar_nuevo_eur: c.coste_anual_tar_nuevo_eur, diferencia_anual_eur: c.diferencia_anual_eur, impacto_economico: c.impacto_economico, coste_calculable: c.coste_calculable, version_catalogo_costes: c.version_catalogo_costes, fecha_importacion_catalogo_costes: c.fecha_importacion_catalogo_costes }; }
  window.CambiosCosts = { COLUMNS, NOTE, normalize, euro, loadState, saveState, templateXLSX, validateRows, importRows, calculate, enrichRecords, publicCostColumns };
}());


(function () {
  const chartRefs = {};
  function destroy(id) { if (chartRefs[id]) { chartRefs[id].destroy(); delete chartRefs[id]; } }
  function table(rows) {
    const headers = Object.keys(rows[0] || {});
    if (!headers.length) return '<p class="small muted">Sin datos.</p>';
    return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${headers.map((h) => `<td>${String(r[h] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function aggregate(records, keyFn) {
    const map = new Map();
    records.forEach((r) => { const key = keyFn(r) || 'Sin fecha'; const c = r.impacto_coste || {}; const row = map.get(key) || { periodo: key, cambios: 0, calculables: 0, no_calculables: 0, ahorro_anual_estimado: 0, sobrecoste_anual_estimado: 0, balance_neto_anual_estimado: 0 }; row.cambios += 1; if (c.coste_calculable === 'si') { row.calculables += 1; const d = Number(c.diferencia_anual_eur) || 0; if (d > 0) row.ahorro_anual_estimado += d; if (d < 0) row.sobrecoste_anual_estimado += Math.abs(d); row.balance_neto_anual_estimado += d; } else row.no_calculables += 1; map.set(key, row); });
    return Array.from(map.values()).sort((a, b) => String(a.periodo).localeCompare(String(b.periodo)));
  }
  function cumulative(monthly) { let balance = 0, ahorro = 0, sobrecoste = 0, calculables = 0; return monthly.map((m) => { balance += m.balance_neto_anual_estimado; ahorro += m.ahorro_anual_estimado; sobrecoste += m.sobrecoste_anual_estimado; calculables += m.calculables; return { periodo: m.periodo, balance_economico_acumulado: balance, ahorro_acumulado: ahorro, sobrecoste_acumulado: sobrecoste, cambios_calculables_acumulados: calculables }; }); }
  function impactRows(records) { return records.map((r) => ({ fecha: r.fecha, patient_id: r.patient_id, tar_anterior: r.tar_antiguo_normalizado || r.tar_antiguo, tar_nuevo: r.tar_nuevo_normalizado || r.tar_nuevo, motivo: r.motivo_normalizado, ...window.CambiosCosts.publicCostColumns(r, window.CambiosCostsState || {}) })); }
  function missingRows(records) { return records.filter((r) => r.impacto_coste?.coste_calculable !== 'si').map((r) => ({ fecha: r.fecha || '', patient_id: r.patient_id || '', motivo: r.motivo_normalizado || '', tar_anterior_no_encontrado: r.impacto_coste?.missing_old || '', tar_nuevo_no_encontrado: r.impacto_coste?.missing_new || '', motivo_no_calculable: r.impacto_coste?.error_coste || '' })); }
  function summary(records) { const diffs = records.map((r) => r.impacto_coste).filter((c) => c?.coste_calculable === 'si').map((c) => Number(c.diferencia_anual_eur) || 0).sort((a, b) => a - b); const total = records.length, calculables = diffs.length, noCalc = total - calculables; const ahorro = diffs.filter((d) => d > 0).reduce((a, b) => a + b, 0), sobre = Math.abs(diffs.filter((d) => d < 0).reduce((a, b) => a + b, 0)), balance = diffs.reduce((a, b) => a + b, 0); const mediana = diffs.length ? (diffs[Math.floor((diffs.length - 1) / 2)] + diffs[Math.ceil((diffs.length - 1) / 2)]) / 2 : 0; return { total, calculables, noCalc, pct: total ? (calculables * 100 / total) : 0, ahorro, sobre, balance, media: calculables ? balance / calculables : 0, mediana }; }
  function filtered(records) { const $ = (id) => document.getElementById(id); const from = $('cost-filter-from')?.value || '', to = $('cost-filter-to')?.value || '', year = $('cost-filter-year')?.value || '', month = $('cost-filter-month')?.value || '', reason = $('cost-filter-reason')?.value || '', type = $('cost-filter-type')?.value || ''; const old = ($('cost-filter-old')?.value || '').toLowerCase(), newer = ($('cost-filter-new')?.value || '').toLowerCase(); return records.filter((r) => (!from || r.fecha >= from) && (!to || r.fecha <= to) && (!year || String(r.anio) === year) && (!month || String(r.mes) === month) && (!reason || r.motivo_normalizado === reason) && (!old || String(r.tar_antiguo_normalizado || r.tar_antiguo || '').toLowerCase().includes(old)) && (!newer || String(r.tar_nuevo_normalizado || r.tar_nuevo || '').toLowerCase().includes(newer)) && (!type || r.impacto_coste?.impacto_economico === type)); }
  function renderCharts(monthly, annual, accum) { if (!window.Chart) return; [['chart-cost-monthly', monthly, 'balance_neto_anual_estimado'], ['chart-cost-annual', annual, 'balance_neto_anual_estimado'], ['chart-cost-cumulative', accum, 'balance_economico_acumulado']].forEach(([id, rows, valueKey]) => { const canvas = document.getElementById(id); if (!canvas) return; destroy(id); chartRefs[id] = new Chart(canvas, { type: id.includes('cumulative') ? 'line' : 'bar', data: { labels: rows.map((r) => r.periodo), datasets: [{ label: '€', data: rows.map((r) => r[valueKey]), backgroundColor: '#0f766e', borderColor: '#075985', borderWidth: 2, tension: 0.3 }] }, options: { responsive: true, scales: { y: { beginAtZero: true } } } }); }); }
  function exportRows(rows, filename) { if (window.XLSX) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Datos'); XLSX.writeFile(wb, filename); } else window.CambiosIO.exportCSV(rows, filename.replace(/\.xlsx$/i, '.csv')); }
  function render(records, state) {
    window.CambiosCostsState = state || window.CambiosCostsState || {}; const enriched = window.CambiosCosts.enrichRecords(records || [], window.CambiosCostsState); const $ = (id) => document.getElementById(id); if ($('cost-note')) $('cost-note').textContent = window.CambiosCosts.NOTE;
    const catalog = window.CambiosCostsState.catalog || []; const active = catalog.filter((c) => !c.fecha_fin_vigencia).length; if ($('cost-catalog-summary')) $('cost-catalog-summary').innerHTML = [['Tratamientos importados', catalog.length], ['Fecha importación', window.CambiosCostsState.importedAt || 'Sin catálogo'], ['Costes vigentes sin fecha fin', active], ['Costes con fecha fin', catalog.length - active], ['Posibles incidencias', 0], ['Versión activa', window.CambiosCostsState.activeBatchId || 'Sin catálogo']].map(([l,v])=>`<div class="metric"><span>${l}</span><strong>${v}</strong></div>`).join('');
    ['cost-filter-year','cost-filter-month','cost-filter-reason'].forEach((id) => { const el=$(id); if (!el) return; const old=el.value; const vals = id.includes('year') ? Array.from(new Set(enriched.map(r=>r.anio).filter(Boolean))).sort() : id.includes('month') ? Array.from({length:12},(_,i)=>i+1) : (window.CambiosNormalize?.MOTIVOS || []); el.innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option value="${v}">${v}</option>`).join(''); el.value=old; });
    const rows = filtered(enriched); const monthly = aggregate(rows, (r) => r.fecha ? `${r.anio}-${String(r.mes).padStart(2,'0')}` : 'Sin fecha'); const annual = aggregate(rows, (r) => r.anio || 'Sin fecha').map((r) => ({ ...r, promedio_impacto_calculable: r.calculables ? r.balance_neto_anual_estimado / r.calculables : 0 })); const accum = cumulative(monthly); const missing = missingRows(rows); const s = summary(rows); window.CambiosEconomicRows = { impact: impactRows(rows), monthly, annual, cumulative: accum, missing };
    if ($('cost-dashboard-cards')) $('cost-dashboard-cards').innerHTML = [['Total cambios', s.total], ['Calculables', s.calculables], ['No calculables', s.noCalc], ['% calculables', `${s.pct.toFixed(1)}%`], ['Ahorro anual total', window.CambiosCosts.euro(s.ahorro)], ['Sobrecoste anual total', window.CambiosCosts.euro(s.sobre)], ['Balance neto anual', window.CambiosCosts.euro(s.balance)], ['Media por cambio', window.CambiosCosts.euro(s.media)], ['Mediana por cambio', window.CambiosCosts.euro(s.mediana)]].map(([l,v])=>`<div class="metric"><span>${l}</span><strong>${v}</strong></div>`).join('');
    if ($('cost-impact-table')) $('cost-impact-table').innerHTML = table(window.CambiosEconomicRows.impact); if ($('cost-monthly-table')) $('cost-monthly-table').innerHTML = table(monthly); if ($('cost-annual-table')) $('cost-annual-table').innerHTML = table(annual); if ($('cost-cumulative-table')) $('cost-cumulative-table').innerHTML = table(accum); if ($('cost-missing-table')) $('cost-missing-table').innerHTML = table(missing); renderCharts(monthly, annual, accum);
  }
  async function readAndValidate(file) { const rows = await window.CambiosIO.readExcel(file); return window.CambiosCosts.validateRows(rows, file?.name || ''); }
  window.CambiosCostsUI = { render, readAndValidate, exportRows };
}());
