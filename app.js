(function () {
  const state = { records: [], filtered: [], excelRows: [], importValidated: [], lastReport: null, claveConfigurada: false, tarBuilders: { old: { medicamentos: [], autoPauta: '' }, new: { medicamentos: [], autoPauta: '' } } };
  const $ = (id) => document.getElementById(id);

  function toast(message, type = 'ok') {
    const el = $('toast'); el.textContent = message; el.className = `toast show ${type}`;
    setTimeout(() => el.classList.remove('show'), 4200);
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  function sortByDate(records) { return [...records].sort((a, b) => `${b.fecha} ${b.fecha_creacion}`.localeCompare(`${a.fecha} ${a.fecha_creacion}`)); }
  function normalizedOld(r) { return r.tar_antiguo_normalizado || r.tar_antiguo || ''; }
  function normalizedNew(r) { return r.tar_nuevo_normalizado || r.tar_nuevo || ''; }
  function normalizedTransition(r) { return r.transicion_tar_normalizada || r.transicion_tar || `${normalizedOld(r)} → ${normalizedNew(r)}`; }
  function isPendingReview(r) { return !r.tar_antiguo_reconocido || !r.tar_nuevo_reconocido || !r.motivo_clasificado || !r.motivo_normalizado; }

  function updateSecurityWarnings(message) {
    const hasActiveKey = window.CambiosCrypto.hasPseudonymizationKey();
    const hasSavedKey = window.CambiosCrypto.hasPersistedPseudonymizationKey();
    state.claveConfigurada = hasActiveKey;

    const keyStatus = $('key-status');
    if (keyStatus) {
      keyStatus.className = `alert ${hasActiveKey ? 'info' : 'warning'}`;
      keyStatus.textContent = message || (hasActiveKey
        ? (hasSavedKey ? 'Clave local disponible en este navegador.' : 'Hay una clave activa configurada para esta sesión.')
        : 'No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');
    }

    ['record-key-warning', 'import-key-warning'].forEach((id) => {
      const warning = $(id);
      if (warning) warning.classList.toggle('hidden', hasActiveKey);
    });
  }

  function showSection(id) {
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === id));
    document.querySelectorAll('[data-section-link]').forEach((link) => link.classList.toggle('active', link.dataset.sectionLink === id));
    location.hash = id;
    $('top-nav').classList.remove('open');
    if (id === 'dashboard') window.CambiosCharts.renderCharts(state.records);
  }

  async function refresh() {
    state.records = sortByDate((await window.CambiosStorage.getAllRecords()).map((r) => window.CambiosIO.deriveRecord({ ...r, patient_id: r.patient_id, tar_antiguo: r.tar_antiguo_original || r.tar_antiguo, tar_nuevo: r.tar_nuevo_original || r.tar_nuevo, tar_antiguo_medicamentos: r.tar_antiguo_medicamentos, tar_nuevo_medicamentos: r.tar_nuevo_medicamentos, tar_antiguo_normalizado: r.tar_antiguo_normalizado, tar_nuevo_normalizado: r.tar_nuevo_normalizado, tar_antiguo_normalizacion_manual: r.tar_antiguo_normalizacion_manual, tar_nuevo_normalizacion_manual: r.tar_nuevo_normalizacion_manual, motivo_original: r.motivo_original, motivo_normalizado: r.motivo_normalizado, motivo_detalle: r.motivo_detalle, origen: r.origen, id: r.id, fecha_creacion: r.fecha_creacion })));
    applyFilters(); renderDashboard(); renderPatientOptions();
  }

  function validInputRecord(data) {
    return data.fecha && data.patient_id && normalizedOld(data) && normalizedNew(data) && data.motivo_normalizado && !Number.isNaN(new Date(`${data.fecha}T00:00:00`).getTime());
  }

  async function recordFromClinical(raw, origen) {
    const pseudonymizationKey = window.CambiosCrypto.getActivePseudonymizationKey();
    if (!raw.patient_id && !pseudonymizationKey) throw new Error('No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');
    const patientId = raw.patient_id || await window.CambiosCrypto.pseudonymize(raw.historia, pseudonymizationKey);
    return window.CambiosIO.deriveRecord({ fecha: raw.fecha, patient_id: patientId, tar_antiguo: raw.tar_antiguo, tar_nuevo: raw.tar_nuevo, tar_antiguo_medicamentos: raw.tar_antiguo_medicamentos, tar_nuevo_medicamentos: raw.tar_nuevo_medicamentos, motivo_original: raw.motivo, motivo_normalizado: raw.motivo_normalizado, motivo_detalle: raw.motivo_detalle, tar_antiguo_normalizado: raw.tar_antiguo_normalizado, tar_nuevo_normalizado: raw.tar_nuevo_normalizado, tar_antiguo_normalizacion_manual: raw.tar_antiguo_normalizacion_manual, tar_nuevo_normalizacion_manual: raw.tar_nuevo_normalizacion_manual, origen, id: raw.id });
  }

  function duplicateSet(records = state.records) { return new Set(records.map(window.CambiosIO.duplicateKey)); }

  async function handleManualSubmit(event) {
    event.preventDefault();
    try {
      const motivo = $('reason-normalized').value;
      const detail = $('reason-detail').value.trim();
      if (!$('change-date').value) throw new Error('Debe indicar la fecha del cambio.');
      if (!$('clinical-id').value.trim()) throw new Error('Debe indicar el número de historia clínica.');
      if (!state.tarBuilders.old.medicamentos.length) throw new Error('Añada al menos un medicamento al TAR antiguo.');
      if (!state.tarBuilders.new.medicamentos.length) throw new Error('Añada al menos un medicamento al TAR nuevo.');
      if (!motivo) throw new Error('Debe seleccionar el motivo del cambio.');
      if (motivo === 'Otros' && !detail) throw new Error('Debe especificar el motivo cuando seleccione Otros.');
      const oldManual = $('old-normalized-manual').value.trim();
      const newManual = $('new-normalized-manual').value.trim();
      const raw = {
        fecha: $('change-date').value,
        historia: $('clinical-id').value,
        tar_antiguo: originalFromMeds(state.tarBuilders.old.medicamentos),
        tar_nuevo: originalFromMeds(state.tarBuilders.new.medicamentos),
        tar_antiguo_medicamentos: state.tarBuilders.old.medicamentos,
        tar_nuevo_medicamentos: state.tarBuilders.new.medicamentos,
        tar_antiguo_normalizado: oldManual,
        tar_nuevo_normalizado: newManual,
        tar_antiguo_normalizacion_manual: oldManual !== state.tarBuilders.old.autoPauta,
        tar_nuevo_normalizacion_manual: newManual !== state.tarBuilders.new.autoPauta,
        motivo: detail || motivo,
        motivo_normalizado: motivo,
        motivo_detalle: detail
      };
      const record = await recordFromClinical(raw, 'registro manual');
      if (!validInputRecord(record)) throw new Error('Revise los campos obligatorios y la fecha.');
      if (duplicateSet().has(window.CambiosIO.duplicateKey(record))) throw new Error('Ya existe un registro exacto con ese patient_id, fecha, TAR antiguo, TAR nuevo y motivo.');
      await window.CambiosStorage.saveRecord(record);
      $('clinical-id').value = '';
      $('record-form').reset(); $('change-date').value = new Date().toISOString().slice(0, 10); resetTarBuilders(); toggleReasonDetail();
      $('record-message').textContent = `Cambio guardado. Patient ID: ${record.patient_id}. El número de historia no se ha guardado en claro.`;
      toast('Registro guardado y dashboard actualizado.');
      await refresh();
    } catch (error) { $('record-message').textContent = error.message; toast(error.message, 'error'); }
  }

  function originalFromMeds(meds) {
    return meds.map((m) => m.nombre || m.principio_activo || m.pauta).filter(Boolean).join(' + ');
  }

  function medicationId(med) {
    return [med.codigo_nacional, med.nombre, med.principio_activo].filter(Boolean).join('|').toLowerCase();
  }

  function renderTarBuilder(kind) {
    const builder = state.tarBuilders[kind];
    const prefix = kind === 'old' ? 'old' : 'new';
    const label = kind === 'old' ? 'TAR antiguo' : 'TAR nuevo';
    const normalized = window.CambiosNormalize.normalizarPautaTAR(builder.medicamentos);
    builder.autoPauta = normalized.pauta || '';
    const manualInput = $(`${prefix}-normalized-manual`);
    if (!manualInput.dataset.manualEdited) manualInput.value = builder.autoPauta;
    $(`${prefix}-normalization-warning`).classList.toggle('hidden', !normalized.advertencia);
    $(`${prefix}-selected`).innerHTML = builder.medicamentos.length ? builder.medicamentos.map((med, index) => `<div class="selected-med"><div><strong>${escapeHtml(med.nombre || 'Medicamento manual')}</strong><small>${escapeHtml([med.principio_activo, med.forma_farmaceutica, med.laboratorio, med.codigo_nacional ? `CN: ${med.codigo_nacional}` : '', med.fuente].filter(Boolean).join(' · '))}</small></div><button class="link-btn danger-text" type="button" data-remove-med="${kind}" data-index="${index}">Eliminar</button></div>`).join('') : `<p class="small muted">Sin medicamentos seleccionados para ${label}.</p>`;
  }

  function resetTarBuilders() {
    state.tarBuilders.old = { medicamentos: [], autoPauta: '' };
    state.tarBuilders.new = { medicamentos: [], autoPauta: '' };
    ['old', 'new'].forEach((kind) => {
      $(`${kind}-cima-results`).innerHTML = '';
      $(`${kind}-cima-message`).textContent = 'Busque y añada uno o varios medicamentos.';
      const manualInput = $(`${kind}-normalized-manual`);
      manualInput.dataset.manualEdited = '';
      renderTarBuilder(kind);
    });
  }

  function addMedication(kind, medication) {
    const clean = {
      nombre: String(medication.nombre || '').trim(), codigo_nacional: String(medication.codigo_nacional || '').trim(),
      principio_activo: String(medication.principio_activo || medication.pauta || '').trim(), forma_farmaceutica: String(medication.forma_farmaceutica || '').trim(),
      laboratorio: String(medication.laboratorio || '').trim(), fuente: medication.fuente || 'Manual'
    };
    if (!clean.nombre && !clean.principio_activo) throw new Error('Indique nombre o principio activo/pauta del medicamento.');
    const id = medicationId(clean);
    if (state.tarBuilders[kind].medicamentos.some((med) => medicationId(med) === id)) throw new Error('Este medicamento ya está añadido a la pauta.');
    state.tarBuilders[kind].medicamentos.push(clean);
    $(`${kind}-normalized-manual`).dataset.manualEdited = '';
    renderTarBuilder(kind);
  }

  async function searchCimaFor(kind) {
    const prefix = kind === 'old' ? 'old' : 'new';
    const addLabel = kind === 'old' ? 'Añadir al TAR antiguo' : 'Añadir al TAR nuevo';
    $(`${prefix}-cima-message`).textContent = 'Consultando CIMA/AEMPS…';
    $(`${prefix}-cima-results`).innerHTML = '';
    const result = await window.CambiosNormalize.buscarMedicamentoCIMA($(`${prefix}-cima-query`).value);
    $(`${prefix}-cima-message`).textContent = result.message;
    if (!result.results.length) {
      $(`${prefix}-manual-panel`).classList.remove('hidden');
      return;
    }
    $(`${prefix}-cima-results`).innerHTML = result.results.map((item, index) => `<article class="cima-result-card"><div><strong>${escapeHtml(item.nombre)}</strong><small>${escapeHtml([item.principio_activo, item.forma_farmaceutica, item.laboratorio, item.codigo_nacional ? `CN: ${item.codigo_nacional}` : ''].filter(Boolean).join(' · '))}</small></div><button class="btn secondary" type="button" data-add-cima="${kind}" data-index="${index}">${addLabel}</button></article>`).join('');
    $(`${prefix}-cima-results`).dataset.results = JSON.stringify(result.results);
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
      ['TAR nuevo más frecuente', top(records, 'tar_nuevo_normalizado')[0]],
      ['Transición más frecuente', top(records, 'transicion_tar_normalizada')[0]],
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
    fillSelect('filter-reason', window.CambiosNormalize.MOTIVOS);
  }
  function applyFilters() {
    updateFilterOptions();
    const from = $('filter-from').value, to = $('filter-to').value, year = $('filter-year').value, month = $('filter-month').value, reason = $('filter-reason').value;
    const old = $('filter-old').value.toLowerCase(), newer = $('filter-new').value.toLowerCase(), origin = $('filter-origin').value, patient = $('filter-patient').value.toLowerCase();
    state.filtered = state.records.filter((r) => (!from || r.fecha >= from) && (!to || r.fecha <= to) && (!year || String(r.anio) === year) && (!month || String(r.mes) === month) && (!reason || r.motivo_normalizado === reason) && (!old || normalizedOld(r).toLowerCase().includes(old) || (r.tar_antiguo_original || '').toLowerCase().includes(old)) && (!newer || normalizedNew(r).toLowerCase().includes(newer) || (r.tar_nuevo_original || '').toLowerCase().includes(newer)) && (!origin || r.origen === origin) && (!patient || r.patient_id.toLowerCase().includes(patient)));
    renderRecordsTable();
  }

  function renderRecordsTable() {
    const rows = state.filtered;
    $('records-table').innerHTML = `<p class="small"><strong>${rows.length}</strong> registros mostrados de ${state.records.length}. ${state.records.filter(isPendingReview).length} pendientes de revisar.</p><table><thead><tr><th>Fecha</th><th>Patient ID</th><th>TAR antiguo original</th><th>TAR antiguo normalizado</th><th>TAR nuevo original</th><th>TAR nuevo normalizado</th><th>Transición normalizada</th><th>Motivo</th><th>Detalle</th><th>Estado</th><th>Origen</th><th>Acciones</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.fecha}</td><td>${escapeHtml(r.patient_id)}</td><td>${escapeHtml(r.tar_antiguo_original || r.tar_antiguo)}</td><td>${escapeHtml(normalizedOld(r))}</td><td>${escapeHtml(r.tar_nuevo_original || r.tar_nuevo)}</td><td>${escapeHtml(normalizedNew(r))}</td><td>${escapeHtml(normalizedTransition(r))}</td><td>${escapeHtml(r.motivo_normalizado)}</td><td>${escapeHtml(r.motivo_detalle || '')}</td><td>${isPendingReview(r) ? '<span class="badge warning">Pendiente</span>' : '<span class="badge ok">OK</span>'}</td><td>${escapeHtml(r.origen)}</td><td><button class="link-btn" data-edit="${r.id}">Editar</button><button class="link-btn danger-text" data-delete="${r.id}">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="12">Sin registros.</td></tr>'}</tbody></table>`;
  }

  async function editRecord(id) {
    const r = state.records.find((item) => item.id === id); if (!r) return;
    const fecha = prompt('Fecha del cambio (YYYY-MM-DD)', r.fecha); if (!fecha) return;
    const oldTar = prompt('TAR antiguo original', r.tar_antiguo_original || r.tar_antiguo); if (oldTar === null) return;
    const newTar = prompt('TAR nuevo original', r.tar_nuevo_original || r.tar_nuevo); if (newTar === null) return;
    const motivo = prompt(`Motivo normalizado (${window.CambiosNormalize.MOTIVOS.join(', ')})`, r.motivo_normalizado || 'Otros'); if (motivo === null) return;
    const detail = motivo === 'Otros' ? prompt('Motivo detalle', r.motivo_detalle || r.motivo_original || '') : (r.motivo_detalle || '');
    await window.CambiosStorage.saveRecord(window.CambiosIO.deriveRecord({ ...r, fecha, patient_id: r.patient_id, tar_antiguo: oldTar, tar_nuevo: newTar, motivo_original: detail || motivo, motivo_normalizado: window.CambiosNormalize.MOTIVOS.includes(motivo) ? motivo : 'Otros', motivo_detalle: detail || '', origen: r.origen, id: r.id, fecha_creacion: r.fecha_creacion }));
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
      if (!window.CambiosCrypto.getActivePseudonymizationKey()) throw new Error('No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');
      if (Object.values(mapping).some((v) => !v)) throw new Error('Debe mapear todas las columnas esperadas.');
      const existing = duplicateSet();
      const valid = []; const errors = []; const duplicates = []; const warnings = [];
      for (const [index, row] of state.excelRows.entries()) {
        try {
          const record = await recordFromClinical({ fecha: row[mapping.fecha], historia: row[mapping.historia], tar_antiguo: row[mapping.tar_antiguo], tar_nuevo: row[mapping.tar_nuevo], motivo: row[mapping.motivo] }, 'histórico importado');
          if (!validInputRecord(record)) throw new Error('Campos obligatorios incompletos o fecha inválida.');
          const key = window.CambiosIO.duplicateKey(record);
          if (existing.has(key) || valid.some((r) => window.CambiosIO.duplicateKey(r) === key)) duplicates.push({ index: index + 2, record }); else { if (isPendingReview(record)) warnings.push({ index: index + 2, record }); valid.push(record); }
        } catch (error) { errors.push({ index: index + 2, error: error.message }); }
      }
      state.importValidated = valid;
      $('import-valid-btn').disabled = valid.length === 0;
      $('import-summary').innerHTML = `<div class="metric-grid compact-metrics"><div class="metric"><span>Registros detectados</span><strong>${state.excelRows.length}</strong></div><div class="metric"><span>Validados</span><strong>${valid.length}</strong></div><div class="metric"><span>Pendientes de revisar</span><strong>${warnings.length}</strong></div><div class="metric"><span>Errores</span><strong>${errors.length}</strong></div><div class="metric"><span>Duplicados</span><strong>${duplicates.length}</strong></div></div><p class="small">Puede editar las normalizaciones sugeridas antes de importar. Los registros con TAR no reconocido o motivo no clasificado quedan marcados como pendientes.</p>`;
      $('import-preview').innerHTML = `<h3>Previsualización editable</h3><table><thead><tr><th>Fila</th><th>Fecha</th><th>patient_id seudonimizado</th><th>TAR antiguo original</th><th>TAR antiguo normalizado</th><th>TAR nuevo original</th><th>TAR nuevo normalizado</th><th>Motivo original</th><th>Motivo normalizado sugerido</th><th>Motivo detalle</th><th>Estado de validación</th></tr></thead><tbody>${valid.map((r, i) => `<tr><td>${i + 2}</td><td>${r.fecha}</td><td>${r.patient_id}</td><td>${escapeHtml(r.tar_antiguo_original)}</td><td><input data-import-index="${i}" data-import-field="tar_antiguo_normalizado" value="${escapeHtml(normalizedOld(r))}"></td><td>${escapeHtml(r.tar_nuevo_original)}</td><td><input data-import-index="${i}" data-import-field="tar_nuevo_normalizado" value="${escapeHtml(normalizedNew(r))}"></td><td>${escapeHtml(r.motivo_original)}</td><td><select data-import-index="${i}" data-import-field="motivo_normalizado">${window.CambiosNormalize.MOTIVOS.map((m) => `<option ${r.motivo_normalizado === m ? 'selected' : ''}>${m}</option>`).join('')}</select></td><td><input data-import-index="${i}" data-import-field="motivo_detalle" value="${escapeHtml(r.motivo_detalle || '')}"></td><td>${isPendingReview(r) ? '<span class="badge warning">Pendiente revisión</span>' : '<span class="badge ok">OK</span>'}</td></tr>`).join('')}${errors.slice(0, 20).map((e) => `<tr><td>${e.index}</td><td colspan="10">Error: ${escapeHtml(e.error)}</td></tr>`).join('')}${duplicates.slice(0, 20).map((d) => `<tr><td>${d.index}</td><td>${d.record.fecha}</td><td>${d.record.patient_id}</td><td colspan="7">Duplicado posible: ${escapeHtml(normalizedTransition(d.record))}</td><td><span class="badge warning">Duplicado</span></td></tr>`).join('')}</tbody></table>`;
      toast('Validación completada.');
    } catch (error) { toast(error.message, 'error'); }
  }

  async function importValidated() {
    document.querySelectorAll('[data-import-index]').forEach((el) => {
      const record = state.importValidated[Number(el.dataset.importIndex)];
      if (!record) return;
      record[el.dataset.importField] = el.value;
      record.tar_antiguo = record.tar_antiguo_normalizado;
      record.tar_nuevo = record.tar_nuevo_normalizado;
      record.transicion_tar_normalizada = `${record.tar_antiguo_normalizado} → ${record.tar_nuevo_normalizado}`;
      record.transicion_tar = record.transicion_tar_normalizada;
      if (el.dataset.importField === 'tar_antiguo_normalizado') record.tar_antiguo_reconocido = true;
      if (el.dataset.importField === 'tar_nuevo_normalizado') record.tar_nuevo_reconocido = true;
      if (el.dataset.importField === 'motivo_normalizado') record.motivo_clasificado = true;
    });
    const pending = state.importValidated.filter(isPendingReview).length;
    if (pending && !confirm(`${pending} registros siguen pendientes de revisar. ¿Importarlos igualmente?`)) return;
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
    $('patient-summary').innerHTML = id ? `<div class="metric"><span>Total de cambios del paciente</span><strong>${rows.length}</strong></div><p><strong>Secuencia TAR:</strong> ${escapeHtml(rows.map((r) => normalizedNew(r)).join(' → ') || 'Sin datos')}</p>` : '<p>Seleccione un patient_id seudonimizado.</p>';
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
      if (Array.isArray(data.custom_tar_dictionary)) window.CambiosNormalize.saveCustomDictionary(data.custom_tar_dictionary);
      const sanitized = records.map((r) => window.CambiosIO.deriveRecord({ ...r, patient_id: r.patient_id, tar_antiguo: r.tar_antiguo_original || r.tar_antiguo, tar_nuevo: r.tar_nuevo_original || r.tar_nuevo, tar_antiguo_medicamentos: r.tar_antiguo_medicamentos, tar_nuevo_medicamentos: r.tar_nuevo_medicamentos, tar_antiguo_normalizado: r.tar_antiguo_normalizado, tar_nuevo_normalizado: r.tar_nuevo_normalizado, tar_antiguo_normalizacion_manual: r.tar_antiguo_normalizacion_manual, tar_nuevo_normalizacion_manual: r.tar_nuevo_normalizacion_manual, motivo_original: r.motivo_original, motivo_normalizado: r.motivo_normalizado, motivo_detalle: r.motivo_detalle, origen: r.origen || 'backup importado', id: r.id, fecha_creacion: r.fecha_creacion }));
      await window.CambiosStorage.bulkSave(sanitized);
      toast(`Backup importado: ${sanitized.length} registros.`); await refresh();
    } catch (error) { toast(error.message, 'error'); }
  }

  function bindEvents() {
    document.querySelectorAll('[data-section-link]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); showSection(el.dataset.sectionLink); }));
    $('menu-toggle').addEventListener('click', () => $('top-nav').classList.toggle('open'));
    $('record-form').addEventListener('submit', handleManualSubmit);
    window.addEventListener('pseudonymization-key-changed', () => updateSecurityWarnings());
    $('record-form').addEventListener('reset', () => setTimeout(() => { resetTarBuilders(); toggleReasonDetail(); }, 0));
    ['old', 'new'].forEach((kind) => {
      $(`${kind}-cima-search`).addEventListener('click', () => searchCimaFor(kind));
      $(`${kind}-manual-toggle`).addEventListener('click', () => $(`${kind}-manual-panel`).classList.toggle('hidden'));
      $(`${kind}-manual-add`).addEventListener('click', () => { try { addMedication(kind, { nombre: $(`${kind}-manual-name`).value, principio_activo: $(`${kind}-manual-active`).value, fuente: 'Manual' }); $(`${kind}-manual-name`).value = ''; $(`${kind}-manual-active`).value = ''; } catch (error) { toast(error.message, 'error'); } });
      $(`${kind}-normalized-manual`).addEventListener('input', (e) => { e.target.dataset.manualEdited = e.target.value !== state.tarBuilders[kind].autoPauta ? 'true' : ''; });
    });
    document.addEventListener('click', (e) => {
      if (e.target.dataset.addCima) {
        try { const results = JSON.parse($(`${e.target.dataset.addCima}-cima-results`).dataset.results || '[]'); addMedication(e.target.dataset.addCima, results[Number(e.target.dataset.index)]); } catch (error) { toast(error.message, 'error'); }
      }
      if (e.target.dataset.removeMed) { state.tarBuilders[e.target.dataset.removeMed].medicamentos.splice(Number(e.target.dataset.index), 1); $(`${e.target.dataset.removeMed}-normalized-manual`).dataset.manualEdited = ''; renderTarBuilder(e.target.dataset.removeMed); }
    });
    $('reason-normalized').addEventListener('change', toggleReasonDetail);
    $('save-key-btn').addEventListener('click', () => {
      if (window.CambiosCrypto.setPseudonymizationKey($('security-key').value, $('save-key').checked)) {
        $('security-key').value = '';
        updateSecurityWarnings('Clave local configurada correctamente. Ya puede registrar cambios reales.');
        toast('Clave local configurada correctamente. Ya puede registrar cambios reales.');
      } else {
        updateSecurityWarnings();
        toast('Introduzca una clave válida.', 'error');
      }
    });
    $('check-key-btn').addEventListener('click', () => {
      const hasActiveKey = window.CambiosCrypto.hasPseudonymizationKey();
      const hasSavedKey = window.CambiosCrypto.hasPersistedPseudonymizationKey();
      const message = hasActiveKey
        ? `Hay una clave activa configurada para esta sesión.${hasSavedKey ? ' La clave está guardada en este navegador.' : ''}`
        : 'No hay clave activa configurada.';
      updateSecurityWarnings(message);
      toast(message, hasActiveKey ? 'ok' : 'error');
    });
    $('clear-key-btn').addEventListener('click', () => { window.CambiosCrypto.clearPseudonymizationKey(); updateSecurityWarnings(); toast('Clave olvidada en este navegador.'); });
    $('delete-all-btn').addEventListener('click', async () => { if (confirm('Primera confirmación: ¿borrar todos los datos locales?') && confirm('Segunda confirmación: esta acción no se puede deshacer.')) { await window.CambiosStorage.clearAll(); window.CambiosNormalize.clearLocalNormalizationConfig(); window.CambiosCrypto.clearPseudonymizationKey(); updateSecurityWarnings(); await refresh(); toast('Todos los datos locales han sido borrados.'); } });
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
    resetTarBuilders(); toggleReasonDetail();
    $('report-year').value = new Date().getFullYear();
    $('report-month').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('');
    $('report-month').value = new Date().getMonth() + 1;
  }

  window.updateSecurityWarnings = updateSecurityWarnings;

  document.addEventListener('DOMContentLoaded', async () => { bindEvents(); initDates(); updateSecurityWarnings(); await refresh(); showSection(location.hash?.slice(1) || 'inicio'); });
}());
