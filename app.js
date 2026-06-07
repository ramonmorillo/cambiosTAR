(function () {
  const state = { records: [], filtered: [], excelRows: [], importValidated: [], lastReport: null };
  const $ = (id) => document.getElementById(id);

  function toast(message, type = 'ok') {
    const el = $('toast'); el.textContent = message; el.className = `toast show ${type}`;
    setTimeout(() => el.classList.remove('show'), 4200);
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  function sortByDate(records) { return [...records].sort((a, b) => `${b.fecha} ${b.fecha_creacion}`.localeCompare(`${a.fecha} ${a.fecha_creacion}`)); }

  function showSection(id) {
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === id));
    document.querySelectorAll('[data-section-link]').forEach((link) => link.classList.toggle('active', link.dataset.sectionLink === id));
    location.hash = id;
    $('top-nav').classList.remove('open');
    if (id === 'dashboard') window.CambiosCharts.renderCharts(state.records);
  }

  async function refresh() {
    state.records = sortByDate(await window.CambiosStorage.getAllRecords());
    applyFilters(); renderDashboard(); renderPatientOptions();
  }

  function validInputRecord(data) {
    return data.fecha && data.patient_id && data.tar_antiguo && data.tar_nuevo && data.motivo_original && !Number.isNaN(new Date(`${data.fecha}T00:00:00`).getTime());
  }

  async function recordFromClinical(raw, origen) {
    const patientId = await window.CambiosCrypto.pseudonymize(raw.historia);
    return window.CambiosIO.deriveRecord({ fecha: raw.fecha, patient_id: patientId, tar_antiguo: raw.tar_antiguo, tar_nuevo: raw.tar_nuevo, motivo_original: raw.motivo, origen });
  }

  function duplicateSet(records = state.records) { return new Set(records.map(window.CambiosIO.duplicateKey)); }

  async function handleManualSubmit(event) {
    event.preventDefault();
    try {
      const raw = { fecha: $('change-date').value, historia: $('clinical-id').value, tar_antiguo: $('old-tar').value, tar_nuevo: $('new-tar').value, motivo: $('reason').value };
      const record = await recordFromClinical(raw, 'registro manual');
      if (!validInputRecord(record)) throw new Error('Revise los campos obligatorios y la fecha.');
      if (duplicateSet().has(window.CambiosIO.duplicateKey(record))) throw new Error('Ya existe un registro exacto con ese patient_id, fecha, TAR antiguo, TAR nuevo y motivo.');
      await window.CambiosStorage.saveRecord(record);
      $('clinical-id').value = '';
      $('record-form').reset();
      $('record-message').textContent = `Cambio guardado. Patient ID: ${record.patient_id}. El número de historia no se ha guardado en claro.`;
      toast('Registro guardado y dashboard actualizado.');
      await refresh();
    } catch (error) { $('record-message').textContent = error.message; toast(error.message, 'error'); }
  }

  function renderDashboard() {
    const records = state.records;
    const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + 1;
    const top = window.CambiosReports.topValue;
    const metrics = [
      ['Total de cambios registrados', records.length],
      ['Total de pacientes seudonimizados', new Set(records.map((r) => r.patient_id)).size],
      ['Cambios del mes actual', records.filter((r) => r.anio === y && r.mes === m).length],
      ['Cambios del año actual', records.filter((r) => r.anio === y).length],
      ['Motivo más frecuente', top(records, 'motivo_normalizado')[0]],
      ['TAR nuevo más frecuente', top(records, 'tar_nuevo')[0]],
      ['Transición más frecuente', top(records, 'transicion_tar')[0]],
      ['Último registro guardado', records[0]?.fecha || 'Sin datos']
    ];
    $('dashboard-cards').innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    if (document.querySelector('#dashboard.active')) window.CambiosCharts.renderCharts(records);
  }

  function uniqueOptions(key) { return Array.from(new Set(state.records.map((r) => r[key]).filter(Boolean))).sort(); }
  function fillSelect(id, values, first = 'Todos') { const el = $(id); const old = el.value; el.innerHTML = `<option value="">${first}</option>` + values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(''); el.value = old; }
  function updateFilterOptions() {
    fillSelect('filter-year', uniqueOptions('anio'));
    fillSelect('filter-month', Array.from({ length: 12 }, (_, i) => i + 1));
    fillSelect('filter-reason', ['Optimización', 'Efecto adverso', 'Interacción', 'Fracaso virológico', 'Otro']);
  }
  function applyFilters() {
    updateFilterOptions();
    const from = $('filter-from').value, to = $('filter-to').value, year = $('filter-year').value, month = $('filter-month').value, reason = $('filter-reason').value;
    const old = $('filter-old').value.toLowerCase(), newer = $('filter-new').value.toLowerCase(), origin = $('filter-origin').value, patient = $('filter-patient').value.toLowerCase();
    state.filtered = state.records.filter((r) => (!from || r.fecha >= from) && (!to || r.fecha <= to) && (!year || String(r.anio) === year) && (!month || String(r.mes) === month) && (!reason || r.motivo_normalizado === reason) && (!old || r.tar_antiguo.toLowerCase().includes(old)) && (!newer || r.tar_nuevo.toLowerCase().includes(newer)) && (!origin || r.origen === origin) && (!patient || r.patient_id.toLowerCase().includes(patient)));
    renderRecordsTable();
  }

  function renderRecordsTable() {
    const rows = state.filtered;
    $('records-table').innerHTML = `<p class="small"><strong>${rows.length}</strong> registros mostrados de ${state.records.length}.</p><table><thead><tr><th>Fecha</th><th>Patient ID</th><th>TAR antiguo</th><th>TAR nuevo</th><th>Transición TAR</th><th>Motivo original</th><th>Motivo normalizado</th><th>Origen</th><th>Fecha de creación</th><th>Acciones</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.fecha}</td><td>${escapeHtml(r.patient_id)}</td><td>${escapeHtml(r.tar_antiguo)}</td><td>${escapeHtml(r.tar_nuevo)}</td><td>${escapeHtml(r.transicion_tar)}</td><td>${escapeHtml(r.motivo_original)}</td><td>${escapeHtml(r.motivo_normalizado)}</td><td>${escapeHtml(r.origen)}</td><td>${escapeHtml(r.fecha_creacion)}</td><td><button class="link-btn" data-edit="${r.id}">Editar</button><button class="link-btn danger-text" data-delete="${r.id}">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="10">Sin registros.</td></tr>'}</tbody></table>`;
  }

  async function editRecord(id) {
    const r = state.records.find((item) => item.id === id); if (!r) return;
    const fecha = prompt('Fecha del cambio (YYYY-MM-DD)', r.fecha); if (!fecha) return;
    const oldTar = prompt('TAR antiguo', r.tar_antiguo); if (oldTar === null) return;
    const newTar = prompt('TAR nuevo', r.tar_nuevo); if (newTar === null) return;
    const motivo = prompt('Motivo original', r.motivo_original); if (motivo === null) return;
    await window.CambiosStorage.saveRecord(window.CambiosIO.deriveRecord({ ...r, fecha, patient_id: r.patient_id, tar_antiguo: oldTar, tar_nuevo: newTar, motivo_original: motivo, origen: r.origen, id: r.id }));
    toast('Registro editado.'); await refresh();
  }

  async function deleteRecord(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    await window.CambiosStorage.deleteRecord(id); toast('Registro eliminado.'); await refresh();
  }

  function renderMapping(headers) {
    const guess = window.CambiosIO.guessMapping(headers);
    const fields = [['fecha', 'Marca temporal / Fecha'], ['historia', 'Número de historia clínico'], ['tar_antiguo', 'TAR antiguo'], ['tar_nuevo', 'TAR nuevo'], ['motivo', 'Motivo']];
    $('mapping-area').classList.remove('hidden');
    $('mapping-area').innerHTML = `<h3>Mapeo de columnas</h3><div class="form-grid compact">${fields.map(([field, label]) => `<label>${label}<select id="map-${field}"><option value="">Seleccione columna</option>${headers.map((h) => `<option value="${escapeHtml(h)}" ${guess[field] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}</select></label>`).join('')}</div>`;
  }

  async function validateExcel() {
    try {
      const mapping = ['fecha', 'historia', 'tar_antiguo', 'tar_nuevo', 'motivo'].reduce((acc, field) => { acc[field] = $(`map-${field}`).value; return acc; }, {});
      if (Object.values(mapping).some((v) => !v)) throw new Error('Debe mapear todas las columnas esperadas.');
      const existing = duplicateSet();
      const valid = []; const errors = []; const duplicates = [];
      for (const [index, row] of state.excelRows.entries()) {
        try {
          const record = await recordFromClinical({ fecha: row[mapping.fecha], historia: row[mapping.historia], tar_antiguo: row[mapping.tar_antiguo], tar_nuevo: row[mapping.tar_nuevo], motivo: row[mapping.motivo] }, 'histórico importado');
          if (!validInputRecord(record)) throw new Error('Campos obligatorios incompletos o fecha inválida.');
          const key = window.CambiosIO.duplicateKey(record);
          if (existing.has(key) || valid.some((r) => window.CambiosIO.duplicateKey(r) === key)) duplicates.push({ index: index + 2, record }); else valid.push(record);
        } catch (error) { errors.push({ index: index + 2, error: error.message }); }
      }
      state.importValidated = valid;
      $('import-valid-btn').disabled = valid.length === 0;
      $('import-summary').innerHTML = `<div class="metric-grid compact-metrics"><div class="metric"><span>Registros detectados</span><strong>${state.excelRows.length}</strong></div><div class="metric"><span>Validados</span><strong>${valid.length}</strong></div><div class="metric"><span>Errores</span><strong>${errors.length}</strong></div><div class="metric"><span>Duplicados</span><strong>${duplicates.length}</strong></div></div>`;
      $('import-preview').innerHTML = `<h3>Previsualización</h3><table><thead><tr><th>Fila</th><th>Estado</th><th>Fecha</th><th>Patient ID</th><th>Transición</th><th>Motivo</th></tr></thead><tbody>${valid.slice(0, 20).map((r, i) => `<tr><td>${i + 2}</td><td>Validado</td><td>${r.fecha}</td><td>${r.patient_id}</td><td>${escapeHtml(r.transicion_tar)}</td><td>${escapeHtml(r.motivo_original)}</td></tr>`).join('')}${errors.slice(0, 20).map((e) => `<tr><td>${e.index}</td><td>Error: ${escapeHtml(e.error)}</td><td colspan="4"></td></tr>`).join('')}${duplicates.slice(0, 20).map((d) => `<tr><td>${d.index}</td><td>Duplicado posible</td><td>${d.record.fecha}</td><td>${d.record.patient_id}</td><td>${escapeHtml(d.record.transicion_tar)}</td><td>${escapeHtml(d.record.motivo_original)}</td></tr>`).join('')}</tbody></table>`;
      toast('Validación completada.');
    } catch (error) { toast(error.message, 'error'); }
  }

  async function importValidated() {
    await window.CambiosStorage.bulkSave(state.importValidated);
    toast(`Importación finalizada: ${state.importValidated.length} registros importados.`);
    $('import-valid-btn').disabled = true; state.importValidated = []; await refresh();
  }

  function renderPatientOptions() {
    fillSelect('patient-select', uniqueOptions('patient_id'), 'Seleccione patient_id');
    renderPatient();
  }
  function renderPatient() {
    const id = $('patient-select').value; const rows = state.records.filter((r) => r.patient_id === id).sort((a, b) => a.fecha.localeCompare(b.fecha));
    $('patient-summary').innerHTML = id ? `<div class="metric"><span>Total de cambios del paciente</span><strong>${rows.length}</strong></div><p><strong>Secuencia TAR:</strong> ${escapeHtml(rows.map((r) => r.tar_nuevo).join(' → ') || 'Sin datos')}</p>` : '<p>Seleccione un patient_id seudonimizado.</p>';
    $('patient-timeline').innerHTML = rows.map((r) => `<div class="timeline-item"><strong>${r.fecha}</strong><span>${escapeHtml(r.tar_antiguo)} → ${escapeHtml(r.tar_nuevo)}</span><small>${escapeHtml(r.motivo_normalizado)} · ${escapeHtml(r.motivo_original)}</small></div>`).join('');
  }

  function generateReport() {
    const period = window.CambiosReports.periodFromControls($('report-type').value, $('report-year').value, $('report-month').value, $('report-quarter').value, $('report-from').value, $('report-to').value);
    state.lastReport = window.CambiosReports.generateReport(state.records, period);
    $('report-output').innerHTML = window.CambiosReports.renderReport(state.lastReport);
    toast('Informe generado.');
  }

  async function importBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      const records = Array.isArray(data) ? data : data.records;
      if (!Array.isArray(records)) throw new Error('Backup JSON no válido.');
      const sanitized = records.map((r) => window.CambiosIO.deriveRecord({ ...r, patient_id: r.patient_id, tar_antiguo: r.tar_antiguo, tar_nuevo: r.tar_nuevo, motivo_original: r.motivo_original, origen: r.origen || 'backup importado', id: r.id }));
      await window.CambiosStorage.bulkSave(sanitized);
      toast(`Backup importado: ${sanitized.length} registros.`); await refresh();
    } catch (error) { toast(error.message, 'error'); }
  }

  function bindEvents() {
    document.querySelectorAll('[data-section-link]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); showSection(el.dataset.sectionLink); }));
    $('menu-toggle').addEventListener('click', () => $('top-nav').classList.toggle('open'));
    $('record-form').addEventListener('submit', handleManualSubmit);
    $('save-key-btn').addEventListener('click', () => { if (window.CambiosCrypto.setKey($('security-key').value, $('save-key').checked)) { $('security-key').value = ''; $('key-status').textContent = 'Clave configurada. No se mostrará en exportaciones.'; toast('Clave configurada.'); } else toast('Introduzca una clave válida.', 'error'); });
    $('check-key-btn').addEventListener('click', () => toast(window.CambiosCrypto.hasKey() ? 'Hay una clave configurada.' : 'No hay clave configurada.', window.CambiosCrypto.hasKey() ? 'ok' : 'error'));
    $('clear-key-btn').addEventListener('click', () => { window.CambiosCrypto.clearKey(); toast('Clave olvidada en este navegador.'); });
    $('delete-all-btn').addEventListener('click', async () => { if (confirm('Primera confirmación: ¿borrar todos los datos locales?') && confirm('Segunda confirmación: esta acción no se puede deshacer.')) { await window.CambiosStorage.clearAll(); window.CambiosCrypto.clearKey(); await refresh(); toast('Todos los datos locales han sido borrados.'); } });
    $('excel-file').addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; state.excelRows = await window.CambiosIO.readExcel(file); renderMapping(Object.keys(state.excelRows[0] || {})); $('validate-excel-btn').disabled = false; $('import-summary').textContent = `${state.excelRows.length} registros detectados.`; });
    $('validate-excel-btn').addEventListener('click', validateExcel); $('import-valid-btn').addEventListener('click', importValidated);
    ['filter-from', 'filter-to', 'filter-year', 'filter-month', 'filter-reason', 'filter-old', 'filter-new', 'filter-origin', 'filter-patient'].forEach((id) => $(id).addEventListener('input', applyFilters));
    $('clear-filters-btn').addEventListener('click', () => { document.querySelectorAll('.filters input,.filters select').forEach((el) => { el.value = ''; }); applyFilters(); });
    $('records-table').addEventListener('click', (e) => { if (e.target.dataset.edit) editRecord(e.target.dataset.edit); if (e.target.dataset.delete) deleteRecord(e.target.dataset.delete); });
    $('export-filtered-xlsx').addEventListener('click', () => window.CambiosIO.exportXLSX(state.filtered, 'cambiosTAR_filtrado.xlsx')); $('export-filtered-csv').addEventListener('click', () => window.CambiosIO.exportCSV(state.filtered, 'cambiosTAR_filtrado.csv'));
    $('patient-select').addEventListener('change', renderPatient);
    $('export-patient-xlsx').addEventListener('click', () => window.CambiosIO.exportXLSX(state.records.filter((r) => r.patient_id === $('patient-select').value), 'cambiosTAR_paciente.xlsx'));
    $('export-patient-csv').addEventListener('click', () => window.CambiosIO.exportCSV(state.records.filter((r) => r.patient_id === $('patient-select').value), 'cambiosTAR_paciente.csv'));
    $('patient-report-btn').addEventListener('click', () => { const id = $('patient-select').value; if (!id) return toast('Seleccione un patient_id.', 'error'); $('report-output').innerHTML = `<h3>Informe individual seudonimizado</h3><p>Patient ID: ${escapeHtml(id)}</p>` + window.CambiosReports.renderReport(window.CambiosReports.generateReport(state.records.filter((r) => r.patient_id === id), { label: 'Trayectoria completa', from: '', to: '' })); showSection('informes'); });
    $('generate-report-btn').addEventListener('click', generateReport); $('copy-report-btn').addEventListener('click', () => navigator.clipboard.writeText(state.lastReport?.comment || '').then(() => toast('Resumen copiado.'))); $('print-report-btn').addEventListener('click', () => window.print());
    $('export-report-html').addEventListener('click', () => window.CambiosIO.downloadBlob(`<!doctype html><meta charset="utf-8"><title>Informe cambiosTAR</title>${$('report-output').innerHTML}`, 'informe_cambiosTAR.html', 'text/html'));
    $('export-report-xlsx').addEventListener('click', () => window.CambiosIO.exportXLSX(state.lastReport?.records || [], 'informe_cambiosTAR.xlsx')); $('export-report-csv').addEventListener('click', () => window.CambiosIO.exportCSV(state.lastReport?.records || [], 'informe_cambiosTAR.csv'));
    $('home-backup-btn').addEventListener('click', () => window.CambiosIO.exportJSON(state.records, 'backup_cambiosTAR.json'));
    $('export-all-xlsx').addEventListener('click', () => window.CambiosIO.exportXLSX(state.records)); $('export-all-csv').addEventListener('click', () => window.CambiosIO.exportCSV(state.records)); $('export-all-json').addEventListener('click', () => window.CambiosIO.exportJSON(state.records)); $('export-backup-json').addEventListener('click', () => window.CambiosIO.exportJSON(state.records, 'backup_completo_cambiosTAR.json'));
    $('backup-file').addEventListener('change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); });
    $('export-period-btn').addEventListener('click', () => window.CambiosIO.exportXLSX(state.lastReport?.records || state.filtered, 'cambiosTAR_periodo.xlsx')); $('download-template-btn').addEventListener('click', window.CambiosIO.templateXLSX);
  }

  function initDates() {
    $('change-date').value = new Date().toISOString().slice(0, 10);
    $('report-year').value = new Date().getFullYear();
    $('report-month').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('');
    $('report-month').value = new Date().getMonth() + 1;
  }

  document.addEventListener('DOMContentLoaded', async () => { bindEvents(); initDates(); await refresh(); showSection(location.hash?.slice(1) || 'inicio'); });
}());
