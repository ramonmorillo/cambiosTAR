(function () {
  const state = { records: [], filtered: [], patientIdMap: [], selectedExcelFile: null, excelWorkbook: null, excelSheets: [], excelHeaders: [], excelRows: [], importValidated: [], importDuplicatesOmitted: 0, lastReport: null, tarBuilders: { old: { medicamentos: [], autoPauta: '' }, new: { medicamentos: [], autoPauta: '' } } };
  const $ = (id) => document.getElementById(id);

  function toast(message, type = 'ok') {
    const el = $('toast');
    if (!el) {
      console.log(message);
      return;
    }
    el.textContent = message; el.className = `toast show ${type}`;
    setTimeout(() => el.classList.remove('show'), 4200);
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
  function sortByDate(records) { return [...records].sort((a, b) => `${b.fecha} ${b.fecha_creacion}`.localeCompare(`${a.fecha} ${a.fecha_creacion}`)); }
  function normalizedOld(r) { return r.tar_antiguo_normalizado || r.tar_antiguo || ''; }
  function normalizedNew(r) { return r.tar_nuevo_normalizado || r.tar_nuevo || ''; }
  function normalizedTransition(r) { return r.transicion_tar_normalizada || r.transicion_tar || `${normalizedOld(r)} → ${normalizedNew(r)}`; }
  function isPendingReview(r) { return !r.tar_antiguo_reconocido || !r.tar_nuevo_reconocido || !r.motivo_clasificado || !r.motivo_normalizado; }

  const PATIENT_ID_MAP_KEY = 'cambiosTAR_patientIdMap';

  function normalizeOriginalPatientCode(value) {
    return String(value ?? '').trim();
  }

  function normalizePatientId(value) {
    return String(value ?? '').trim().toUpperCase();
  }

  function isPseudonymizedPatientId(value) {
    return /^PT-[A-Z0-9]+$/i.test(String(value ?? '').trim());
  }

  function normalizeMapItem(item) {
    const original = normalizeOriginalPatientCode(item?.original_patient_code);
    const patientId = normalizePatientId(item?.patient_id);
    if (!original || !patientId) return null;
    return { original_patient_code: original, patient_id: patientId, created_at: item?.created_at || new Date().toISOString() };
  }

  function loadPatientIdMap() {
    try {
      const raw = localStorage.getItem(PATIENT_ID_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(normalizeMapItem).filter(Boolean) : [];
    } catch (error) {
      console.error('Error loading patient ID map', error);
      return [];
    }
  }

  function savePatientIdMap(map = state.patientIdMap) {
    try {
      const normalized = map.map(normalizeMapItem).filter(Boolean);
      const byOriginal = new Map();
      const byPatientId = new Map();
      normalized.forEach((item) => {
        if (byOriginal.has(item.original_patient_code) && byOriginal.get(item.original_patient_code) !== item.patient_id) {
          throw new Error('Conflicto de seudonimización: este código local ya está asociado a otro patient_id. Revise los datos antes de continuar.');
        }
        if (byPatientId.has(item.patient_id) && byPatientId.get(item.patient_id) !== item.original_patient_code) {
          throw new Error('Conflicto de seudonimización: este patient_id ya está asociado a otro código local. Revise los datos antes de continuar.');
        }
        byOriginal.set(item.original_patient_code, item.patient_id);
        byPatientId.set(item.patient_id, item.original_patient_code);
      });
      localStorage.setItem(PATIENT_ID_MAP_KEY, JSON.stringify(normalized));
    } catch (error) {
      console.error('Error saving patient ID map', error);
      if (String(error.message || '').startsWith('Conflicto de seudonimización:')) throw error;
      throw new Error('No se ha podido guardar el mapa local de seudonimización en este navegador.');
    }
  }

  function findMappingByOriginalCode(originalCode) {
    const normalized = normalizeOriginalPatientCode(originalCode);
    return state.patientIdMap.find((item) => item.original_patient_code === normalized) || null;
  }

  function findMappingByPatientId(patientId) {
    const normalized = normalizePatientId(patientId);
    return state.patientIdMap.find((item) => normalizePatientId(item.patient_id) === normalized) || null;
  }

  async function getOrCreatePseudonymizedPatientId(originalCode) {
    const normalized = normalizeOriginalPatientCode(originalCode);
    if (!normalized) return null;
    const existing = findMappingByOriginalCode(normalized);
    if (existing) return existing.patient_id;
    const newPatientId = normalizePatientId(await window.CambiosCrypto.pseudonymize(normalized, getPseudonymizationKey()));
    const conflict = findMappingByPatientId(newPatientId);
    if (conflict && conflict.original_patient_code !== normalized) {
      throw new Error('Conflicto de seudonimización: este código local ya está asociado a otro patient_id. Revise los datos antes de continuar.');
    }
    state.patientIdMap.push({ original_patient_code: normalized, patient_id: newPatientId, created_at: new Date().toISOString() });
    savePatientIdMap();
    return newPatientId;
  }

  async function resolveClinicalPatientId(rawValue) {
    const normalized = normalizeOriginalPatientCode(rawValue);
    if (!normalized) return null;
    if (isPseudonymizedPatientId(normalized)) return normalizePatientId(normalized);
    return getOrCreatePseudonymizedPatientId(normalized);
  }

  function uniquePatientIds(ids) {
    const seen = new Set();
    return ids.map(normalizePatientId).filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function searchPatients(term) {
    const ids = resolvePatientSearchTermToIds(term);
    const byId = new Map(state.patientIdMap.map((item) => [normalizePatientId(item.patient_id), item]));
    return ids.map((id) => byId.get(normalizePatientId(id)) || { original_patient_code: '', patient_id: normalizePatientId(id) });
  }

  function resolvePatientSearchTermToIds(searchTerm) {
    const q = String(searchTerm ?? '').trim();
    if (!q) return [];
    const qLower = q.toLowerCase();

    const exactOriginalMatches = state.patientIdMap
      .filter((m) => String(m.original_patient_code ?? '').trim().toLowerCase() === qLower)
      .map((m) => m.patient_id);

    if (exactOriginalMatches.length > 0) return uniquePatientIds(exactOriginalMatches);

    const exactPatientIdMatches = state.patientIdMap
      .filter((m) => String(m.patient_id ?? '').trim().toLowerCase() === qLower)
      .map((m) => m.patient_id);

    const exactRecordsPatientIdMatches = state.records
      .filter((r) => String(r.patient_id ?? '').trim().toLowerCase() === qLower)
      .map((r) => r.patient_id);

    const exactPseudo = uniquePatientIds([...exactPatientIdMatches, ...exactRecordsPatientIdMatches]);
    if (exactPseudo.length > 0) return exactPseudo;

    const partialMapMatches = state.patientIdMap
      .filter((m) => {
        const original = String(m.original_patient_code ?? '').toLowerCase();
        const pseudo = String(m.patient_id ?? '').toLowerCase();
        return original.includes(qLower) || pseudo.includes(qLower);
      })
      .map((m) => m.patient_id);

    const partialRecordMatches = state.records
      .filter((r) => String(r.patient_id ?? '').toLowerCase().includes(qLower))
      .map((r) => r.patient_id);

    return uniquePatientIds([...partialMapMatches, ...partialRecordMatches]);
  }

  function resolveSearchTermToPatientIds(term) {
    return resolvePatientSearchTermToIds(term);
  }

  function resolvePatientSearchTerm(term) {
    const ids = resolvePatientSearchTermToIds(term);
    return ids.length === 1 ? ids[0] : null;
  }

  function patientLabelForId(patientId) {
    const mapping = findMappingByPatientId(patientId);
    return mapping ? `Código local: ${mapping.original_patient_code} · ID seudonimizado: ${mapping.patient_id}` : `ID seudonimizado: ${patientId}`;
  }

  function patientSuggestions(term) {
    const ids = resolvePatientSearchTermToIds(term);
    return ids.map((patientId) => ({ patient_id: patientId, label: patientLabelForId(patientId) }));
  }

  function debugPatientResolution(inputCode) {
    const normalized = normalizeOriginalPatientCode(inputCode);
    const mapping = findMappingByOriginalCode(normalized);
    const resolvedIds = resolvePatientSearchTermToIds(normalized);
    const resolvedPatientId = resolvedIds.length === 1 ? resolvedIds[0] : null;
    const matchingRecords = state.records.filter((r) => resolvedIds.includes(normalizePatientId(r.patient_id)));
    const result = {
      inputCode,
      normalized,
      mapping: JSON.stringify(mapping),
      resolvedPatientId: resolvedPatientId || (resolvedIds.length ? resolvedIds.join(', ') : ''),
      matchingRecords: matchingRecords.length,
      dates: matchingRecords.map((r) => r.fecha || r.date).join(', ')
    };
    console.table(result);
    return { inputCode, normalized, mapping, resolvedPatientId, resolvedIds, matchingRecords };
  }

  function auditPatientMappings() {
    const byOriginal = {};
    const byPseudo = {};

    state.patientIdMap.forEach((m) => {
      const original = String(m.original_patient_code ?? '').trim();
      const pseudo = normalizePatientId(m.patient_id);
      if (!original || !pseudo) return;
      if (!byOriginal[original]) byOriginal[original] = new Set();
      if (!byPseudo[pseudo]) byPseudo[pseudo] = new Set();
      byOriginal[original].add(pseudo);
      byPseudo[pseudo].add(original);
    });

    const originalConflicts = Object.entries(byOriginal)
      .filter(([, set]) => set.size > 1)
      .map(([original, set]) => ({ original, patient_ids: Array.from(set) }));

    const pseudoConflicts = Object.entries(byPseudo)
      .filter(([, set]) => set.size > 1)
      .map(([patient_id, set]) => ({ patient_id, original_codes: Array.from(set) }));

    console.log('[AUDIT] Conflictos por código original:', originalConflicts);
    console.log('[AUDIT] Conflictos por patient_id:', pseudoConflicts);

    return { originalConflicts, pseudoConflicts };
  }

  const VISIT_COUNTER_KEY = 'cambiosTAR_visit_counter';
  const LAST_VISIT_KEY = 'cambiosTAR_last_visit_at';

  function updateFooterTelemetry() {
    const counterEl = $('visit-counter');
    const lastVisitEl = $('last-visit-at');
    if (!counterEl && !lastVisitEl) return;

    try {
      const previousCount = Number.parseInt(localStorage.getItem(VISIT_COUNTER_KEY) || '0', 10);
      const previousVisit = localStorage.getItem(LAST_VISIT_KEY) || '';
      const safeCount = Number.isFinite(previousCount) && previousCount > 0 ? previousCount : 0;
      const currentCount = safeCount + 1;
      const now = new Date();

      localStorage.setItem(VISIT_COUNTER_KEY, String(currentCount));
      localStorage.setItem(LAST_VISIT_KEY, now.toISOString());

      if (counterEl) counterEl.textContent = new Intl.NumberFormat('es-ES').format(currentCount);
      if (lastVisitEl) {
        lastVisitEl.textContent = previousVisit
          ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(previousVisit))
          : 'Primera visita registrada';
      }
    } catch (error) {
      if (counterEl) counterEl.textContent = 'No disponible';
      if (lastVisitEl) lastVisitEl.textContent = 'localStorage bloqueado';
      console.warn('No se pudo actualizar el contador local de visitas.', error);
    }
  }

  function hasPseudonymizationKey() {
    return typeof window.hasPseudonymizationKey === 'function'
      ? window.hasPseudonymizationKey()
      : Boolean(window.CambiosCrypto?.hasPseudonymizationKey?.());
  }

  function getPseudonymizationKey() {
    return typeof window.getPseudonymizationKey === 'function'
      ? window.getPseudonymizationKey()
      : window.CambiosCrypto?.getPseudonymizationKey?.();
  }

  function setPseudonymizationKey(key) {
    if (typeof window.setPseudonymizationKey === 'function') return window.setPseudonymizationKey(key);
    return window.CambiosCrypto.setPseudonymizationKey(key);
  }

  function clearPseudonymizationKey() {
    if (typeof window.clearPseudonymizationKey === 'function') return window.clearPseudonymizationKey();
    return window.CambiosCrypto.clearPseudonymizationKey();
  }

  function updateSecurityState(message) {
    const configured = hasPseudonymizationKey();

    document.querySelectorAll('[data-security-warning]').forEach((el) => {
      el.style.display = configured ? 'none' : 'block';
      el.classList.toggle('hidden', configured);
    });

    document.querySelectorAll('[data-security-ok]').forEach((el) => {
      el.style.display = configured ? 'block' : 'none';
      el.classList.toggle('hidden', !configured);
    });

    document.querySelectorAll('[data-requires-security-key]').forEach((btn) => {
      btn.disabled = !configured;
    });

    const statusMessage = message || (configured
      ? 'Clave local configurada correctamente.'
      : 'No hay clave local configurada.');
    const keyStatus = $('key-status');
    if (keyStatus) {
      keyStatus.className = `alert ${configured ? 'info' : 'warning'}`;
      keyStatus.textContent = statusMessage;
    }
    const securityStatus = $('security-status');
    if (securityStatus) {
      securityStatus.textContent = statusMessage;
    }

    console.log('Estado clave seudonimización:', configured);
  }

  function updateSecurityWarnings(message) {
    updateSecurityState(message);
  }

  function toggleReasonDetail() {
    const motivoSelect =
      $('motivo') ||
      $('reason') ||
      $('motivo-normalizado') ||
      $('reason-normalized');

    const detailInput =
      $('motivo-detalle') ||
      $('reason-detail') ||
      $('motivoDetalle');

    const detailWrapper =
      $('motivo-detalle-wrapper') ||
      $('reason-detail-wrapper') ||
      $('reason-detail-wrap');

    if (!motivoSelect || !detailInput) return;

    const isOther = ['Otros', 'OTROS', 'Otro'].includes(motivoSelect.value);

    if (detailWrapper) {
      detailWrapper.style.display = isOther ? 'block' : 'none';
      detailWrapper.classList.toggle('hidden', !isOther);
    }

    detailInput.required = isOther;

    if (!isOther) {
      detailInput.value = '';
    }
  }

  function showSection(id) {
    document.querySelectorAll('.view').forEach((section) => section.classList.toggle('active', section.id === id));
    document.querySelectorAll('[data-section-link]').forEach((link) => link.classList.toggle('active', link.dataset.sectionLink === id));
    location.hash = id;
    $('top-nav')?.classList.remove('open');
    if (id === 'dashboard') window.CambiosCharts.renderCharts(state.records);
  }

  async function refresh() {
    state.patientIdMap = loadPatientIdMap();
    state.records = sortByDate((await window.CambiosStorage.getAllRecords()).map((r) => window.CambiosIO.deriveRecord({ ...r, patient_id: r.patient_id, tar_antiguo: r.tar_antiguo_original || r.tar_antiguo, tar_nuevo: r.tar_nuevo_original || r.tar_nuevo, tar_antiguo_medicamentos: r.tar_antiguo_medicamentos, tar_nuevo_medicamentos: r.tar_nuevo_medicamentos, tar_antiguo_normalizado: r.tar_antiguo_normalizado, tar_nuevo_normalizado: r.tar_nuevo_normalizado, tar_antiguo_normalizacion_manual: r.tar_antiguo_normalizacion_manual, tar_nuevo_normalizacion_manual: r.tar_nuevo_normalizacion_manual, motivo_original: r.motivo_original, motivo_normalizado: r.motivo_normalizado, motivo_detalle: r.motivo_detalle, origen: r.origen, id: r.id, fecha_creacion: r.fecha_creacion })));
    applyFilters(); renderDashboard(); renderPatientOptions();
  }

  function validInputRecord(data) {
    return data.fecha && data.patient_id && normalizedOld(data) && normalizedNew(data) && data.motivo_normalizado && !Number.isNaN(new Date(`${data.fecha}T00:00:00`).getTime());
  }

  async function recordFromClinical(raw, origen) {
    const directPatientId = raw.patient_id || (isPseudonymizedPatientId(raw.historia) ? raw.historia : '');
    if (!directPatientId && !hasPseudonymizationKey()) throw new Error('No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');
    const patientId = directPatientId ? normalizePatientId(directPatientId) : await resolveClinicalPatientId(raw.historia);
    return window.CambiosIO.deriveRecord({ fecha: raw.fecha, patient_id: patientId, tar_antiguo: raw.tar_antiguo, tar_nuevo: raw.tar_nuevo, tar_antiguo_medicamentos: raw.tar_antiguo_medicamentos, tar_nuevo_medicamentos: raw.tar_nuevo_medicamentos, motivo_original: raw.motivo, motivo_normalizado: raw.motivo_normalizado, motivo_detalle: raw.motivo_detalle, tar_antiguo_normalizado: raw.tar_antiguo_normalizado, tar_nuevo_normalizado: raw.tar_nuevo_normalizado, tar_antiguo_normalizacion_manual: raw.tar_antiguo_normalizacion_manual, tar_nuevo_normalizacion_manual: raw.tar_nuevo_normalizacion_manual, origen, id: raw.id });
  }

  function duplicateSet(records = state.records) { return new Set(records.map(window.CambiosIO.duplicateKey)); }

  async function handleManualSubmit(event) {
    event.preventDefault();
    try {
      if (!hasPseudonymizationKey()) throw new Error('No hay clave local de seudonimización configurada. Configure una clave antes de guardar el cambio.');
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
      const originalCode = $('clinical-id').value;
      const normalizedOriginalCode = normalizeOriginalPatientCode(originalCode);
      const raw = {
        fecha: $('change-date').value,
        historia: originalCode,
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
      if (localStorage.getItem('cambiosTAR_debug') === 'true') {
        const recordsAfterSave = await window.CambiosStorage.getAllRecords();
        console.log('[DEBUG nuevo cambio] originalCode:', originalCode);
        console.log('[DEBUG nuevo cambio] normalizedOriginalCode:', normalizedOriginalCode);
        console.log('[DEBUG nuevo cambio] generatedPatientId:', record.patient_id);
        console.log('[DEBUG nuevo cambio] savedRecord:', record);
        console.log('[DEBUG nuevo cambio] records count:', recordsAfterSave.length);
      }
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
    if (manualInput && !manualInput.dataset.manualEdited) manualInput.value = builder.autoPauta;
    $(`${prefix}-normalization-warning`)?.classList.toggle('hidden', !normalized.advertencia);
    const selectedEl = $(`${prefix}-selected`);
    if (!selectedEl) return;
    selectedEl.innerHTML = builder.medicamentos.length ? builder.medicamentos.map((med, index) => `<div class="selected-med"><div><strong>${escapeHtml(med.nombre || 'Medicamento manual')}</strong><small>${escapeHtml([med.principio_activo, med.forma_farmaceutica, med.laboratorio, med.codigo_nacional ? `CN: ${med.codigo_nacional}` : '', med.fuente].filter(Boolean).join(' · '))}</small></div><button class="link-btn danger-text" type="button" data-remove-med="${kind}" data-index="${index}">Eliminar</button></div>`).join('') : `<p class="small muted">Sin medicamentos seleccionados para ${label}.</p>`;
  }

  function resetTarBuilders() {
    state.tarBuilders.old = { medicamentos: [], autoPauta: '' };
    state.tarBuilders.new = { medicamentos: [], autoPauta: '' };
    ['old', 'new'].forEach((kind) => {
      const results = $(`${kind}-cima-results`);
      const message = $(`${kind}-cima-message`);
      if (results) results.innerHTML = '';
      if (message) message.textContent = 'Busque y añada uno o varios medicamentos.';
      const manualInput = $(`${kind}-normalized-manual`);
      if (manualInput) manualInput.dataset.manualEdited = '';
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
    if ($(`${kind}-normalized-manual`)) $(`${kind}-normalized-manual`).dataset.manualEdited = '';
    renderTarBuilder(kind);
  }

  async function searchCimaFor(kind) {
    const prefix = kind === 'old' ? 'old' : 'new';
    const addLabel = kind === 'old' ? 'Añadir al TAR antiguo' : 'Añadir al TAR nuevo';
    const message = $(`${prefix}-cima-message`);
    const resultsEl = $(`${prefix}-cima-results`);
    const queryEl = $(`${prefix}-cima-query`);
    if (message) message.textContent = 'Consultando CIMA/AEMPS…';
    if (resultsEl) resultsEl.innerHTML = '';
    const result = await window.CambiosNormalize.buscarMedicamentoCIMA(queryEl?.value || '');
    if (message) message.textContent = result.message;
    if (!result.results.length) {
      $(`${prefix}-manual-panel`)?.classList.remove('hidden');
      return;
    }
    if (!resultsEl) return;
    resultsEl.innerHTML = result.results.map((item, index) => `<article class="cima-result-card"><div><strong>${escapeHtml(item.nombre)}</strong><small>${escapeHtml([item.principio_activo, item.forma_farmaceutica, item.laboratorio, item.codigo_nacional ? `CN: ${item.codigo_nacional}` : ''].filter(Boolean).join(' · '))}</small></div><button class="btn secondary" type="button" data-add-cima="${kind}" data-index="${index}">${addLabel}</button></article>`).join('');
    resultsEl.dataset.results = JSON.stringify(result.results);
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
    if (!$('dashboard-cards')) return;
    $('dashboard-cards').innerHTML = metrics.map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
    if (document.querySelector('#dashboard.active')) window.CambiosCharts.renderCharts(records);
  }

  function uniqueOptions(key) { return Array.from(new Set(state.records.map((r) => r[key]).filter(Boolean))).sort(); }
  function fillSelect(id, values, first = 'Todos') { const el = $(id); if (!el) return; const old = el.value; el.innerHTML = `<option value="">${first}</option>` + values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(''); el.value = old; }
  function updateFilterOptions() {
    fillSelect('filter-year', uniqueOptions('anio'));
    fillSelect('filter-month', Array.from({ length: 12 }, (_, i) => i + 1));
    fillSelect('filter-reason', window.CambiosNormalize.MOTIVOS);
  }
  function applyFilters() {
    updateFilterOptions();
    if (!$('records-table')) return;
    const from = $('filter-from')?.value || '', to = $('filter-to')?.value || '', year = $('filter-year')?.value || '', month = $('filter-month')?.value || '', reason = $('filter-reason')?.value || '';
    const old = ($('filter-old')?.value || '').toLowerCase(), newer = ($('filter-new')?.value || '').toLowerCase(), origin = $('filter-origin')?.value || '', patient = $('filter-patient')?.value || '', review = $('filter-review')?.value || '';
    const patientIds = resolvePatientSearchTermToIds(patient);
    state.filtered = state.records.filter((r) => (!from || r.fecha >= from) && (!to || r.fecha <= to) && (!year || String(r.anio) === year) && (!month || String(r.mes) === month) && (!reason || r.motivo_normalizado === reason) && (!old || normalizedOld(r).toLowerCase().includes(old) || (r.tar_antiguo_original || '').toLowerCase().includes(old)) && (!newer || normalizedNew(r).toLowerCase().includes(newer) || (r.tar_nuevo_original || '').toLowerCase().includes(newer)) && (!origin || r.origen === origin) && (!patient || patientIds.includes(normalizePatientId(r.patient_id))) && (!review || (r.estado_revision || (isPendingReview(r) ? 'pendiente' : 'ok')) === review));
    renderRecordsTable();
  }

  function renderRecordsTable() {
    const rows = state.filtered;
    if (!$('records-table')) return;
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

  function renderImportMessage(message, type = 'info') {
    $('import-summary').innerHTML = `<div class="alert ${type}">${escapeHtml(message)}</div>`;
  }

  function selectSheetWithData(sheets) {
    if (!Array.isArray(sheets) || !sheets.length) return null;
    const selectedName = $('excel-sheet-select')?.value;
    return sheets.find((sheet) => sheet.name === selectedName) || sheets.find((sheet) => sheet.rows.length) || sheets[0];
  }

  function renderColumnTable(headers) {
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Columna detectada</th><th>Cabecera normalizada</th></tr></thead><tbody>${headers.map((header, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(header)}</td><td>${escapeHtml(window.CambiosIO.normalizeHeader(header))}</td></tr>`).join('') || '<tr><td colspan="3">No se han detectado columnas.</td></tr>'}</tbody></table></div>`;
  }

  function renderMapping(headers, sheet = null, missingFields = []) {
    const guess = window.CambiosIO.guessMapping(headers);
    const currentMapping = collectImportMapping();
    const fields = [['fecha', 'Fecha'], ['historia', 'Código local / Patient ID'], ['tar_antiguo', 'TAR antiguo'], ['tar_nuevo', 'TAR nuevo'], ['motivo', 'Motivo']];
    const sheetSelector = state.excelSheets.length > 1
      ? `<label>Hoja de Excel<select id="excel-sheet-select">${state.excelSheets.map((item) => `<option value="${escapeHtml(item.name)}" ${sheet?.name === item.name ? 'selected' : ''}>${escapeHtml(item.name)} (${item.rows.length} filas)</option>`).join('')}</select></label>`
      : '';
    $('mapping-area').classList.remove('hidden');
    $('mapping-area').innerHTML = `<h3>Mapeo de columnas</h3>${sheetSelector}<p class="small">Seleccione qué columna corresponde a cada campo obligatorio. ${missingFields.length ? '<strong>Faltan columnas obligatorias. Revise el mapeo manual.</strong>' : 'Columnas reconocidas automáticamente.'}</p><div class="form-grid compact">${fields.map(([field, label]) => `<label>Seleccione qué columna corresponde a ${label}<select id="map-${field}"><option value="">Seleccione columna</option>${headers.map((h) => `<option value="${escapeHtml(h)}" ${(currentMapping[field] || guess[field]) === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}</select></label>`).join('')}</div>${renderColumnTable(headers)}`;
    const sheetSelect = $('excel-sheet-select');
    if (sheetSelect) sheetSelect.addEventListener('change', () => {
      const selected = selectSheetWithData(state.excelSheets);
      state.excelRows = selected?.rows || [];
      state.excelHeaders = selected?.headers || [];
      renderMapping(state.excelHeaders, selected, []);
      $('import-preview').innerHTML = '';
      $('import-valid-btn').disabled = true;
    });
  }

  function collectImportMapping() {
    return ['fecha', 'historia', 'tar_antiguo', 'tar_nuevo', 'motivo'].reduce((acc, field) => {
      acc[field] = $(`map-${field}`)?.value || '';
      return acc;
    }, {});
  }

  function validationStats(valid, errors, duplicates) {
    const requiredErrors = { fecha: 0, historia: 0, tar_antiguo: 0, tar_nuevo: 0, motivo: 0 };
    errors.forEach((item) => {
      Object.keys(requiredErrors).forEach((field) => { if (item.field === field) requiredErrors[field] += 1; });
    });
    return { requiredErrors, duplicates: duplicates.length, valid: valid.length, total: state.excelRows.length };
  }

  async function validateExcel() {
    console.log('Validando Excel');
    try {
      state.importValidated = [];
      state.importDuplicatesOmitted = 0;
      $('import-valid-btn').disabled = true;
      $('import-preview').innerHTML = '';

      if (!window.CambiosIO.hasXlsxLibrary()) {
        console.error('La librería XLSX no está disponible.');
        renderImportMessage('No se ha podido cargar la librería de lectura Excel. Revise la configuración de la página.', 'error');
        toast('La librería XLSX no está disponible.', 'error');
        return;
      }
      if (!state.selectedExcelFile) throw new Error('Debe seleccionar un archivo Excel antes de validar.');
      if (!hasPseudonymizationKey()) throw new Error('No hay clave local de seudonimización configurada. Use solo datos ficticios o configure una clave antes de continuar.');

      try {
        const excel = await window.CambiosIO.readExcelWorkbook(state.selectedExcelFile);
        state.excelWorkbook = excel.workbook;
        state.excelSheets = excel.sheets;
      } catch (error) {
        console.error('No se ha podido leer el Excel.', error);
        renderImportMessage('No se ha podido leer el Excel. Compruebe que el archivo no esté vacío ni protegido.', 'error');
        toast('No se ha podido leer el Excel. Compruebe que el archivo no esté vacío ni protegido.', 'error');
        return;
      }

      const sheet = selectSheetWithData(state.excelSheets);
      state.excelRows = sheet?.rows || [];
      state.excelHeaders = sheet?.headers || [];
      console.log('Hoja leída', sheet?.name || '(sin hoja)');
      console.log('Columnas detectadas', state.excelHeaders);
      console.log('Registros detectados', state.excelRows.length);

      if (!sheet || !state.excelRows.length || !state.excelHeaders.length) throw new Error('No se han detectado filas con datos en el Excel.');

      renderMapping(state.excelHeaders, sheet);
      const mapping = collectImportMapping();
      const missingFields = Object.entries(mapping).filter(([, value]) => !value).map(([field]) => field);
      if (missingFields.length) {
        renderMapping(state.excelHeaders, sheet, missingFields);
        $('import-summary').innerHTML = `<div class="alert warning">Faltan columnas obligatorias. Revise el mapeo manual.</div><p>Archivo leído correctamente.</p><p>Se han detectado ${state.excelRows.length} filas y ${state.excelHeaders.length} columnas.</p>${renderColumnTable(state.excelHeaders)}`;
        return;
      }

      const existing = duplicateSet();
      const valid = []; const errors = []; const duplicates = []; const warnings = [];
      for (const [index, row] of state.excelRows.entries()) {
        try {
          const patientInput = normalizeOriginalPatientCode(row[mapping.historia]);
          const raw = { fecha: row[mapping.fecha], historia: isPseudonymizedPatientId(patientInput) ? '' : patientInput, patient_id: isPseudonymizedPatientId(patientInput) ? patientInput : '', tar_antiguo: row[mapping.tar_antiguo], tar_nuevo: row[mapping.tar_nuevo], motivo: row[mapping.motivo] };
          const missing = ['fecha', 'tar_antiguo', 'tar_nuevo', 'motivo'].find((field) => String(raw[field] ?? '').trim() === '');
          if (missing) throw Object.assign(new Error(`Campo obligatorio ausente: ${missing}.`), { field: missing });
          if (!raw.historia && !raw.patient_id) throw Object.assign(new Error('Campo obligatorio ausente: historia.'), { field: 'historia' });
          const record = await recordFromClinical(raw, 'histórico importado');
          if (!validInputRecord(record)) throw Object.assign(new Error('Campos obligatorios incompletos o fecha inválida.'), { field: !record.fecha ? 'fecha' : null });
          const key = window.CambiosIO.duplicateKey(record);
          if (existing.has(key) || valid.some((r) => window.CambiosIO.duplicateKey(r) === key)) duplicates.push({ index: index + 2, record }); else { if (isPendingReview(record)) warnings.push({ index: index + 2, record }); valid.push(record); }
        } catch (error) { errors.push({ index: index + 2, error: error.message, field: error.field || null }); }
      }
      state.importValidated = valid;
      state.importDuplicatesOmitted = duplicates.length;
      $('import-valid-btn').disabled = valid.length === 0;
      const stats = validationStats(valid, errors, duplicates);
      const tarPending = valid.filter((record) => !record.tar_antiguo_reconocido || !record.tar_nuevo_reconocido).length;
      const recognizedMsg = 'Columnas reconocidas automáticamente.';
      $('import-summary').innerHTML = `<div class="alert ${valid.length ? 'info' : 'warning'}">Archivo leído correctamente. ${valid.length ? `Hay ${valid.length} registros válidos para importar.` : 'No hay registros válidos para importar.'}</div><p>Se han detectado ${state.excelRows.length} filas y ${state.excelHeaders.length} columnas.</p><p>${recognizedMsg}</p><div class="metric-grid compact-metrics"><div class="metric"><span>Registros totales</span><strong>${stats.total}</strong></div><div class="metric"><span>Registros válidos</span><strong>${stats.valid}</strong></div><div class="metric"><span>Fecha ausente/inválida</span><strong>${stats.requiredErrors.fecha}</strong></div><div class="metric"><span>Nº historia ausente</span><strong>${stats.requiredErrors.historia}</strong></div><div class="metric"><span>TAR antiguo ausente</span><strong>${stats.requiredErrors.tar_antiguo}</strong></div><div class="metric"><span>TAR nuevo ausente</span><strong>${stats.requiredErrors.tar_nuevo}</strong></div><div class="metric"><span>Motivo ausente</span><strong>${stats.requiredErrors.motivo}</strong></div><div class="metric"><span>Posibles duplicados</span><strong>${stats.duplicates}</strong></div><div class="metric"><span>TAR pendiente revisión</span><strong>${tarPending}</strong></div></div><p class="small">Puede editar las normalizaciones sugeridas antes de importar. Los registros con TAR no reconocido quedan con estado_normalizacion_tar = “pendiente_revision”.</p>`;
      $('import-preview').innerHTML = `<h3>Previsualización editable</h3><table><thead><tr><th>Fila</th><th>Fecha</th><th>patient_id seudonimizado</th><th>TAR antiguo original</th><th>TAR antiguo normalizado</th><th>TAR nuevo original</th><th>TAR nuevo normalizado</th><th>Motivo original</th><th>Motivo normalizado sugerido</th><th>Motivo detalle</th><th>Estado de validación</th></tr></thead><tbody>${valid.map((r, i) => `<tr><td>${i + 2}</td><td>${r.fecha}</td><td>${escapeHtml(r.patient_id)}</td><td>${escapeHtml(r.tar_antiguo_original)}</td><td><input data-import-index="${i}" data-import-field="tar_antiguo_normalizado" value="${escapeHtml(normalizedOld(r))}"></td><td>${escapeHtml(r.tar_nuevo_original)}</td><td><input data-import-index="${i}" data-import-field="tar_nuevo_normalizado" value="${escapeHtml(normalizedNew(r))}"></td><td>${escapeHtml(r.motivo_original)}</td><td><select data-import-index="${i}" data-import-field="motivo_normalizado">${window.CambiosNormalize.MOTIVOS.map((m) => `<option ${r.motivo_normalizado === m ? 'selected' : ''}>${m}</option>`).join('')}</select></td><td><input data-import-index="${i}" data-import-field="motivo_detalle" value="${escapeHtml(r.motivo_detalle || '')}"></td><td>${isPendingReview(r) ? '<span class="badge warning">Pendiente revisión</span>' : '<span class="badge ok">OK</span>'}</td></tr>`).join('')}${errors.slice(0, 20).map((e) => `<tr><td>${e.index}</td><td colspan="10">Error: ${escapeHtml(e.error)}</td></tr>`).join('')}${duplicates.slice(0, 20).map((d) => `<tr><td>${d.index}</td><td>${d.record.fecha}</td><td>${escapeHtml(d.record.patient_id)}</td><td colspan="7">Duplicado posible: ${escapeHtml(normalizedTransition(d.record))}</td><td><span class="badge warning">Duplicado</span></td></tr>`).join('')}</tbody></table>`;
      toast('Validación completada.');
    } catch (error) {
      console.error('Error validando Excel', error);
      renderImportMessage(error.message, 'error');
      toast(error.message, 'error');
    }
  }

  async function importValidated() {
    document.querySelectorAll('[data-import-index]').forEach((el) => {
      const record = state.importValidated[Number(el.dataset.importIndex)];
      if (!record) return;
      const previousValue = record[el.dataset.importField];
      const changed = String(el.value || '').trim() !== String(previousValue || '').trim();
      record[el.dataset.importField] = el.value;
      record.tar_antiguo = record.tar_antiguo_normalizado;
      record.tar_nuevo = record.tar_nuevo_normalizado;
      record.transicion_tar_normalizada = `${record.tar_antiguo_normalizado} → ${record.tar_nuevo_normalizado}`;
      record.transicion_tar = record.transicion_tar_normalizada;
      if (el.dataset.importField === 'tar_antiguo_normalizado' && changed && el.value.trim()) record.tar_antiguo_reconocido = true;
      if (el.dataset.importField === 'tar_nuevo_normalizado' && changed && el.value.trim()) record.tar_nuevo_reconocido = true;
      if (el.dataset.importField === 'motivo_normalizado') record.motivo_clasificado = true;
    });
    state.importValidated.forEach((record) => {
      record.estado_normalizacion_tar = (!record.tar_antiguo_reconocido || !record.tar_nuevo_reconocido) ? 'pendiente_revision' : 'normalizado';
    });
    const pending = state.importValidated.filter((record) => record.estado_normalizacion_tar === 'pendiente_revision').length;
    if (pending && !confirm(`${pending} registros siguen pendientes de revisar. ¿Importarlos igualmente?`)) return;
    const existing = duplicateSet();
    const toSave = [];
    let duplicates = 0;
    state.importValidated.forEach((record) => {
      const key = window.CambiosIO.duplicateKey(record);
      if (existing.has(key) || toSave.some((item) => window.CambiosIO.duplicateKey(item) === key)) duplicates += 1;
      else toSave.push(record);
    });
    await window.CambiosStorage.bulkSave(toSave);
    const summary = `${toSave.length} registros importados. ${duplicates} duplicados omitidos. ${pending} registros con normalización TAR pendiente de revisión.`;
    $('import-summary').innerHTML = `<div class="alert info">${escapeHtml(summary)}</div>`;
    toast(summary);
    $('import-valid-btn').disabled = true; state.importValidated = []; await refresh();
  }

  function renderPatientOptions() {
    fillSelect('patient-select', uniqueOptions('patient_id'), 'Seleccione patient_id');
    renderPatientSuggestions('');
    renderPatient();
  }

  function selectedPatientId() {
    return $('patient-select')?.value || $('patient-search')?.dataset.selectedPatientId || '';
  }

  function setSelectedPatientId(patientId) {
    const normalized = normalizePatientId(patientId);
    if ($('patient-select')) $('patient-select').value = normalized;
    if ($('patient-search')) {
      $('patient-search').dataset.selectedPatientId = normalized;
      $('patient-search').value = normalized ? patientLabelForId(normalized) : '';
    }
  }

  function renderPatientSuggestions(term) {
    const box = $('patient-suggestions');
    if (!box) return;
    const suggestions = patientSuggestions(term).slice(0, 12);
    box.innerHTML = suggestions.map((item) => `<button type="button" class="patient-suggestion" data-patient-id="${escapeHtml(item.patient_id)}">${escapeHtml(item.label)}</button>`).join('') || (term ? '<p class="small muted">Sin coincidencias.</p>' : '');
  }

  function renderPatient() {
    const id = selectedPatientId();
    const searchTerm = normalizeOriginalPatientCode($('patient-search')?.value || '');
    const rows = state.records.filter((r) => normalizePatientId(r.patient_id) === id).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (id) {
      $('patient-summary').innerHTML = `<div class="metric"><span>Total de cambios del paciente</span><strong>${rows.length}</strong></div><p><strong>Patient ID:</strong> ${escapeHtml(id)}</p><p><strong>Secuencia TAR:</strong> ${escapeHtml(rows.map((r) => normalizedNew(r)).join(' → ') || 'Sin datos')}</p>`;
    } else if (searchTerm) {
      const patientIds = resolvePatientSearchTermToIds(searchTerm);
      $('patient-summary').innerHTML = patientIds.length > 1
        ? '<p>Se encontraron varios pacientes compatibles. Seleccione una opción de la lista para cargar el seguimiento.</p>'
        : '<p>No se encontraron registros para ese código local o ID seudonimizado.</p>';
    } else {
      $('patient-summary').innerHTML = '<p>Busque y seleccione un paciente por código local o patient_id seudonimizado.</p>';
    }
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
    const on = (id, eventName, handler) => {
      const el = $(id);
      if (el) el.addEventListener(eventName, handler);
    };

    document.querySelectorAll('[data-section-link]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); showSection(el.dataset.sectionLink); }));
    on('menu-toggle', 'click', () => $('top-nav')?.classList.toggle('open'));
    on('record-form', 'submit', handleManualSubmit);
    window.addEventListener('pseudonymization-key-changed', () => updateSecurityState());
    on('record-form', 'reset', () => setTimeout(() => { resetTarBuilders(); toggleReasonDetail(); }, 0));
    ['old', 'new'].forEach((kind) => {
      on(`${kind}-cima-search`, 'click', () => searchCimaFor(kind));
      on(`${kind}-manual-toggle`, 'click', () => $(`${kind}-manual-panel`)?.classList.toggle('hidden'));
      on(`${kind}-manual-add`, 'click', () => {
        try {
          addMedication(kind, { nombre: $(`${kind}-manual-name`)?.value, principio_activo: $(`${kind}-manual-active`)?.value, fuente: 'Manual' });
          if ($(`${kind}-manual-name`)) $(`${kind}-manual-name`).value = '';
          if ($(`${kind}-manual-active`)) $(`${kind}-manual-active`).value = '';
        } catch (error) { toast(error.message, 'error'); }
      });
      on(`${kind}-normalized-manual`, 'input', (e) => { e.target.dataset.manualEdited = e.target.value !== state.tarBuilders[kind].autoPauta ? 'true' : ''; });
    });
    document.addEventListener('click', (e) => {
      const target = e.target?.closest?.('[data-add-cima], [data-remove-med]') || e.target;
      if (target?.dataset?.addCima) {
        try { const results = JSON.parse($(`${target.dataset.addCima}-cima-results`)?.dataset.results || '[]'); addMedication(target.dataset.addCima, results[Number(target.dataset.index)]); } catch (error) { toast(error.message, 'error'); }
      }
      if (target?.dataset?.removeMed) {
        state.tarBuilders[target.dataset.removeMed].medicamentos.splice(Number(target.dataset.index), 1);
        const manual = $(`${target.dataset.removeMed}-normalized-manual`);
        if (manual) manual.dataset.manualEdited = '';
        renderTarBuilder(target.dataset.removeMed);
      }
    });
    const motivoSelect = $('motivo') || $('reason') || $('motivo-normalizado') || $('reason-normalized');
    if (motivoSelect) motivoSelect.addEventListener('change', toggleReasonDetail);
    on('save-key-btn', 'click', () => {
      try {
        const saved = setPseudonymizationKey($('security-key')?.value);
        if (!saved) { updateSecurityState(); return; }
        if ($('security-key')) $('security-key').value = '';
        updateSecurityState('Clave local configurada correctamente. Ya puede registrar cambios.');
        toast('Clave local configurada correctamente. Ya puede registrar cambios.');
      } catch (error) {
        updateSecurityState();
        toast(error.message || 'Introduzca una clave válida.', 'error');
      }
    });
    on('check-key-btn', 'click', () => {
      const configured = hasPseudonymizationKey();
      const message = configured ? 'Hay una clave local configurada en este navegador.' : 'No hay clave local configurada.';
      updateSecurityState(message);
      toast(message, configured ? 'ok' : 'error');
    });
    on('clear-key-btn', 'click', () => { clearPseudonymizationKey(); updateSecurityState('Clave local eliminada.'); toast('Clave local eliminada.'); });
    on('delete-all-btn', 'click', async () => { if (confirm('Primera confirmación: ¿borrar todos los datos locales?') && confirm('Segunda confirmación: esta acción no se puede deshacer.')) { await window.CambiosStorage.clearAll(); window.CambiosNormalize.clearLocalNormalizationConfig(); clearPseudonymizationKey(); updateSecurityState(); await refresh(); toast('Todos los datos locales han sido borrados.'); } });
    on('excel-file', 'change', (e) => {
      const file = e.target.files[0];
      state.selectedExcelFile = file || null;
      state.excelWorkbook = null; state.excelSheets = []; state.excelRows = []; state.excelHeaders = []; state.importValidated = [];
      if ($('import-valid-btn')) $('import-valid-btn').disabled = true;
      if ($('import-preview')) $('import-preview').innerHTML = '';
      $('mapping-area')?.classList.add('hidden');
      if ($('mapping-area')) $('mapping-area').innerHTML = '';
      if (!file) { if ($('validate-excel-btn')) $('validate-excel-btn').disabled = true; renderImportMessage('Seleccione un archivo Excel para comenzar.', 'info'); return; }
      console.log('Archivo seleccionado', file.name);
      if ($('validate-excel-btn')) $('validate-excel-btn').disabled = false;
      if ($('import-summary')) $('import-summary').innerHTML = `<div class="alert info">Archivo seleccionado: <strong>${escapeHtml(file.name)}</strong>. Pulse “Validar Excel”.</div>`;
    });
    on('validate-excel-btn', 'click', validateExcel);
    on('import-valid-btn', 'click', importValidated);
    ['filter-from', 'filter-to', 'filter-year', 'filter-month', 'filter-reason', 'filter-old', 'filter-new', 'filter-origin', 'filter-patient', 'filter-review'].forEach((id) => on(id, 'input', applyFilters));
    on('clear-filters-btn', 'click', () => { document.querySelectorAll('.filters input,.filters select').forEach((el) => { el.value = ''; }); applyFilters(); });
    on('records-table', 'click', (e) => { if (e.target.dataset.edit) editRecord(e.target.dataset.edit); if (e.target.dataset.delete) deleteRecord(e.target.dataset.delete); });
    on('export-filtered-xlsx', 'click', () => window.CambiosIO.exportXLSX(state.filtered, 'cambiosTAR_filtrado.xlsx'));
    on('export-filtered-csv', 'click', () => window.CambiosIO.exportCSV(state.filtered, 'cambiosTAR_filtrado.csv'));
    on('patient-select', 'change', () => { setSelectedPatientId($('patient-select')?.value); renderPatient(); });
    on('patient-search', 'input', (e) => { e.target.dataset.selectedPatientId = ''; if ($('patient-select')) $('patient-select').value = ''; renderPatientSuggestions(e.target.value); const ids = resolvePatientSearchTermToIds(e.target.value); if (ids.length === 1 && normalizeOriginalPatientCode(e.target.value).length >= 3) { if ($('patient-select')) $('patient-select').value = ids[0]; e.target.dataset.selectedPatientId = ids[0]; } renderPatient(); });
    on('patient-suggestions', 'click', (e) => { const button = e.target.closest('[data-patient-id]'); if (!button) return; setSelectedPatientId(button.dataset.patientId); renderPatientSuggestions(''); renderPatient(); });
    on('export-patient-xlsx', 'click', () => window.CambiosIO.exportXLSX(state.records.filter((r) => normalizePatientId(r.patient_id) === selectedPatientId()), 'cambiosTAR_paciente.xlsx'));
    on('export-patient-csv', 'click', () => window.CambiosIO.exportCSV(state.records.filter((r) => normalizePatientId(r.patient_id) === selectedPatientId()), 'cambiosTAR_paciente.csv'));
    on('patient-report-btn', 'click', () => { const id = selectedPatientId(); if (!id) return toast('Seleccione un patient_id.', 'error'); $('report-output').innerHTML = `<h3>Informe individual seudonimizado</h3><p>Patient ID: ${escapeHtml(id)}</p>` + window.CambiosReports.renderReport(window.CambiosReports.generateReport(state.records.filter((r) => normalizePatientId(r.patient_id) === id), { label: 'Trayectoria completa', from: '', to: '' })); showSection('informes'); });
    on('generate-report-btn', 'click', generateReport);
    on('copy-report-btn', 'click', () => navigator.clipboard.writeText(state.lastReport?.comment || '').then(() => toast('Resumen copiado.')));
    on('print-report-btn', 'click', () => window.print());
    on('export-report-html', 'click', () => window.CambiosIO.downloadBlob(`<!doctype html><meta charset="utf-8"><title>Informe cambiosTAR</title>${$('report-output')?.innerHTML || ''}`, 'informe_cambiosTAR.html', 'text/html'));
    on('export-report-xlsx', 'click', () => window.CambiosIO.exportXLSX(state.lastReport?.records || [], 'informe_cambiosTAR.xlsx'));
    on('export-report-csv', 'click', () => window.CambiosIO.exportCSV(state.lastReport?.records || [], 'informe_cambiosTAR.csv'));
    on('home-backup-btn', 'click', () => window.CambiosIO.exportJSON(state.records, 'backup_cambiosTAR.json'));
    on('export-all-xlsx', 'click', () => window.CambiosIO.exportXLSX(state.records));
    on('export-all-csv', 'click', () => window.CambiosIO.exportCSV(state.records));
    on('export-all-json', 'click', () => window.CambiosIO.exportJSON(state.records));
    on('export-backup-json', 'click', () => window.CambiosIO.exportJSON(state.records, 'backup_completo_cambiosTAR.json'));
    on('backup-file', 'change', (e) => { if (e.target.files[0]) importBackup(e.target.files[0]); });
    on('export-period-btn', 'click', () => window.CambiosIO.exportXLSX(state.lastReport?.records || state.filtered, 'cambiosTAR_periodo.xlsx'));
    on('download-template-btn', 'click', window.CambiosIO.templateXLSX);
  }

  function initDates() {
    if ($('change-date')) $('change-date').value = new Date().toISOString().slice(0, 10);
    resetTarBuilders(); toggleReasonDetail();
    if ($('report-year')) $('report-year').value = new Date().getFullYear();
    if (!$('report-month')) return;
    $('report-month').innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('');
    $('report-month').value = new Date().getMonth() + 1;
  }

  window.CambiosPatients = { normalizeOriginalPatientCode, isPseudonymizedPatientId, loadPatientIdMap, savePatientIdMap, findMappingByOriginalCode, findMappingByPatientId, searchPatients, resolveSearchTermToPatientIds, resolvePatientSearchTermToIds, resolvePatientSearchTerm, debugPatientResolution, auditPatientMappings };
  window.debugPatientResolution = debugPatientResolution;
  window.auditPatientMappings = auditPatientMappings;

  window.updateSecurityState = updateSecurityState;
  window.updateSecurityWarnings = updateSecurityWarnings;
  window.toggleReasonDetail = toggleReasonDetail;

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof bindEvents === 'function') bindEvents();
    if (typeof initDates === 'function') initDates();
    if (typeof toggleReasonDetail === 'function') toggleReasonDetail();
    if (typeof updateSecurityState === 'function') updateSecurityState();
    if (typeof updateFooterTelemetry === 'function') updateFooterTelemetry();
    if (typeof refresh === 'function') await refresh();
    if (typeof renderCurrentView === 'function') renderCurrentView();
    else showSection(location.hash?.slice(1) || 'inicio');
  });
}());
