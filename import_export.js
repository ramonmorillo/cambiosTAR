(function () {
  const EXPECTED = {
    fecha: ['fecha', 'fecha cambio', 'fecha del cambio', 'marca temporal', 'timestamp', 'marca de tiempo', 'fecha registro', 'date'],
    historia: ['patient id', 'patient_id', 'paciente', 'numero de historia clinica', 'numero de historia clinico', 'numero historia', 'nhc', 'historia clinica', 'historia clinico', 'numero de historia', 'numero de historia', 'n historia', 'no historia', 'historia', 'codigo paciente', 'codigo de paciente'],
    tar_antiguo: ['tar antiguo', 'tar previo', 'tar anterior', 'tratamiento anterior', 'tratamiento previo', 'tratamiento antiguo', 'pauta previa', 'pauta anterior', 'pauta antigua'],
    tar_nuevo: ['tar nuevo', 'tar actual', 'tar posterior', 'tratamiento nuevo', 'tratamiento actual', 'tratamiento posterior', 'nueva pauta', 'pauta nueva'],
    motivo: ['motivo', 'motivo cambio', 'motivo del cambio', 'causa', 'causa del cambio', 'razon', 'razon del cambio']
  };

  function normalizeHeader(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/n[º°]/g, 'n')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeText(value) {
    return normalizeHeader(value);
  }

  function normalizeReason(reason) {
    return window.CambiosNormalize.classifyReason(reason).motivo_normalizado || 'Otros';
  }

  function toDateString(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && window.XLSX) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);
    const parts = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (parts) {
      const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
      return `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    return '';
  }

  function deriveRecord({ fecha, patient_id, tar_antiguo, tar_nuevo, motivo_original, motivo_normalizado, motivo_detalle, origen, id, fecha_creacion, tar_antiguo_original, tar_antiguo_normalizado, tar_nuevo_original, tar_nuevo_normalizado, tar_antiguo_medicamentos, tar_nuevo_medicamentos, tar_antiguo_normalizacion_manual, tar_nuevo_normalizacion_manual, normalizacion_manual, estado_revision }) {
    const date = toDateString(fecha);
    const d = new Date(`${date}T00:00:00`);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const oldOriginal = String(tar_antiguo_original ?? tar_antiguo ?? '').trim();
    const newOriginal = String(tar_nuevo_original ?? tar_nuevo ?? '').trim();
    const oldAuto = tar_antiguo_medicamentos?.length ? window.CambiosNormalize.normalizarPautaTAR(tar_antiguo_medicamentos) : null;
    const newAuto = tar_nuevo_medicamentos?.length ? window.CambiosNormalize.normalizarPautaTAR(tar_nuevo_medicamentos) : null;
    const oldNorm = tar_antiguo_normalizado ? { original: oldOriginal, normalizado: tar_antiguo_normalizado, reconocido: Boolean(tar_antiguo_normalizacion_manual) || !oldAuto?.advertencia, advertencia: Boolean(oldAuto?.advertencia) } : (oldAuto ? { original: oldOriginal, normalizado: oldAuto.pauta, reconocido: oldAuto.reconocido, advertencia: oldAuto.advertencia } : window.CambiosNormalize.normalizeTar(oldOriginal));
    const newNorm = tar_nuevo_normalizado ? { original: newOriginal, normalizado: tar_nuevo_normalizado, reconocido: Boolean(tar_nuevo_normalizacion_manual) || !newAuto?.advertencia, advertencia: Boolean(newAuto?.advertencia) } : (newAuto ? { original: newOriginal, normalizado: newAuto.pauta, reconocido: newAuto.reconocido, advertencia: newAuto.advertencia } : window.CambiosNormalize.normalizeTar(newOriginal));
    const motivo = String(motivo_original || motivo_detalle || motivo_normalizado || '').trim();
    const classified = motivo_normalizado ? { motivo_normalizado, motivo_detalle: motivo_detalle || '', motivo_original: motivo, clasificado: true } : window.CambiosNormalize.classifyReason(motivo);
    const normalizedReason = window.CambiosNormalize.MOTIVOS.includes(classified.motivo_normalizado) ? classified.motivo_normalizado : 'Otros';
    const detail = normalizedReason === 'Otros' ? String(motivo_detalle || classified.motivo_detalle || motivo).trim() : String(motivo_detalle || classified.motivo_detalle || '').trim();
    return {
      id: id || (crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}-${Math.random()}`),
      fecha: date,
      patient_id,
      tar_antiguo_medicamentos: Array.isArray(tar_antiguo_medicamentos) ? tar_antiguo_medicamentos : (oldOriginal ? [{ nombre: oldOriginal, fuente: 'Importación/manual' }] : []),
      tar_antiguo_original: oldOriginal,
      tar_antiguo_normalizado: oldNorm.normalizado,
      tar_antiguo_normalizacion_manual: Boolean(tar_antiguo_normalizacion_manual),
      tar_nuevo_medicamentos: Array.isArray(tar_nuevo_medicamentos) ? tar_nuevo_medicamentos : (newOriginal ? [{ nombre: newOriginal, fuente: 'Importación/manual' }] : []),
      tar_nuevo_original: newOriginal,
      tar_nuevo_normalizado: newNorm.normalizado,
      tar_nuevo_normalizacion_manual: Boolean(tar_nuevo_normalizacion_manual),
      tar_antiguo: oldNorm.normalizado,
      tar_nuevo: newNorm.normalizado,
      motivo_original: motivo,
      motivo_normalizado: normalizedReason,
      motivo_detalle: detail,
      tar_antiguo_reconocido: Boolean(oldNorm.reconocido),
      tar_nuevo_reconocido: Boolean(newNorm.reconocido),
      motivo_clasificado: Boolean(classified.clasificado || motivo_normalizado),
      estado_normalizacion_tar: (!oldNorm.reconocido || !newNorm.reconocido) ? 'pendiente_revision' : 'normalizado',
      estado_revision: estado_revision || ((!oldNorm.reconocido || !newNorm.reconocido || !Boolean(classified.clasificado || motivo_normalizado)) ? 'pendiente' : 'ok'),
      normalizacion_manual: Boolean(normalizacion_manual || tar_antiguo_normalizacion_manual || tar_nuevo_normalizacion_manual),
      anio: year,
      mes: month,
      trimestre: quarter,
      transicion_tar_normalizada: `${oldNorm.normalizado} → ${newNorm.normalizado}`,
      transicion_tar: `${oldNorm.normalizado} → ${newNorm.normalizado}`,
      origen,
      fecha_creacion: fecha_creacion || new Date().toISOString()
    };
  }

  function duplicateKey(record) {
    return [record.patient_id, record.fecha, record.tar_antiguo_normalizado || record.tar_antiguo, record.tar_nuevo_normalizado || record.tar_nuevo, record.motivo_normalizado, record.motivo_detalle || ''].map((v) => String(v || '').trim().toLowerCase()).join('|');
  }

  function publicRows(records) {
    return records.map((r) => ({
      fecha: r.fecha,
      patient_id: r.patient_id,
      tar_antiguo_original: r.tar_antiguo_original || r.tar_antiguo,
      tar_antiguo_normalizado: r.tar_antiguo_normalizado || r.tar_antiguo,
      tar_nuevo_original: r.tar_nuevo_original || r.tar_nuevo,
      tar_nuevo_normalizado: r.tar_nuevo_normalizado || r.tar_nuevo,
      transicion_tar_normalizada: r.transicion_tar_normalizada || r.transicion_tar,
      motivo_normalizado: r.motivo_normalizado,
      motivo_detalle: r.motivo_detalle || '',
      motivo_original: r.motivo_original || '',
      estado_normalizacion_tar: r.estado_normalizacion_tar || ((!r.tar_antiguo_reconocido || !r.tar_nuevo_reconocido) ? 'pendiente_revision' : 'normalizado'),
      origen: r.origen,
      fecha_creacion: r.fecha_creacion,
      anio: r.anio,
      mes: r.mes,
      trimestre: r.trimestre,
      tar_antiguo_medicamentos: JSON.stringify(r.tar_antiguo_medicamentos || []),
      tar_nuevo_medicamentos: JSON.stringify(r.tar_nuevo_medicamentos || []),
      tar_antiguo_normalizacion_manual: r.tar_antiguo_normalizacion_manual ? 'Sí' : 'No',
      tar_nuevo_normalizacion_manual: r.tar_nuevo_normalizacion_manual ? 'Sí' : 'No',
      estado_revision: r.estado_revision || ((!r.tar_antiguo_reconocido || !r.tar_nuevo_reconocido || !r.motivo_clasificado) ? 'pendiente' : 'ok'),
      normalizacion_manual: r.normalizacion_manual || r.tar_antiguo_normalizacion_manual || r.tar_nuevo_normalizacion_manual ? 'Sí' : 'No',
      pendiente_revision: (!r.tar_antiguo_reconocido || !r.tar_nuevo_reconocido || !r.motivo_clasificado || r.estado_revision === 'pendiente') ? 'Sí' : 'No'
    }));
  }


  function sanitizeRecordForBackup(record) {
    const allowed = [
      'id', 'fecha', 'anio', 'mes', 'trimestre', 'patient_id',
      'tar_antiguo_medicamentos', 'tar_antiguo_original', 'tar_antiguo_normalizado',
      'tar_nuevo_medicamentos', 'tar_nuevo_original', 'tar_nuevo_normalizado',
      'transicion_tar_normalizada', 'motivo_normalizado', 'motivo_detalle', 'motivo_original',
      'origen', 'fecha_creacion', 'normalizacion_manual', 'estado_revision',
      'tar_antiguo_reconocido', 'tar_nuevo_reconocido', 'motivo_clasificado',
      'estado_normalizacion_tar', 'tar_antiguo_normalizacion_manual', 'tar_nuevo_normalizacion_manual'
    ];
    return allowed.reduce((acc, key) => {
      if (Object.prototype.hasOwnProperty.call(record || {}, key)) acc[key] = record[key];
      return acc;
    }, {});
  }

  function downloadBlob(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCSV(records, filename = 'cambiosTAR_registros.csv') {
    const rows = publicRows(records);
    const headers = Object.keys(rows[0] || publicRows([{}])[0]);
    const csv = [headers.join(';'), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
    downloadBlob(`\ufeff${csv}`, filename, 'text/csv;charset=utf-8');
  }

  function exportJSON(records, filename = 'cambiosTAR_registros.json') {
    const backup = {
      app: 'cambiosTAR',
      exported_at: new Date().toISOString(),
      records: (records || []).map(sanitizeRecordForBackup),
      custom_tar_dictionary: window.CambiosNormalize.getCustomDictionary(),
      settings: { schema: 1 }
    };
    downloadBlob(JSON.stringify(backup, null, 2), filename, 'application/json');
  }

  function exportXLSX(records, filename = 'cambiosTAR_registros.xlsx') {
    if (!window.XLSX) return exportCSV(records, filename.replace(/\.xlsx$/i, '.csv'));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(publicRows(records));
    XLSX.utils.book_append_sheet(wb, ws, 'Registros');
    const dict = window.CambiosNormalize.getCustomDictionary();
    if (dict.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dict), 'Diccionario local TAR');
    XLSX.writeFile(wb, filename);
  }

  function templateXLSX() {
    const rows = [{ Fecha: '', 'Número de historia clínico': '', 'TAR antiguo': '', 'TAR nuevo': '', Motivo: '' }, { Fecha: 'No subir esta plantilla a GitHub ni compartirla con datos reales.', 'Número de historia clínico': '', 'TAR antiguo': '', 'TAR nuevo': '', Motivo: '' }];
    if (!window.XLSX) {
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(';'), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
      return downloadBlob(`\ufeff${csv}`, 'plantilla_cambiosTAR.csv', 'text/csv;charset=utf-8');
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Plantilla');
    XLSX.writeFile(wb, 'plantilla_cambiosTAR.xlsx');
  }

  function hasXlsxLibrary() {
    return Boolean(window.XLSX && window.XLSX.read && window.XLSX.utils && window.XLSX.utils.sheet_to_json);
  }

  function guessMapping(headers) {
    const mapping = {};
    const normalizedAliases = Object.fromEntries(Object.entries(EXPECTED).map(([field, aliases]) => [field, aliases.map(normalizeHeader)]));
    Object.entries(normalizedAliases).forEach(([field, aliases]) => {
      const found = headers.find((h) => {
        const normalized = normalizeHeader(h);
        return aliases.includes(normalized) || aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized));
      });
      if (found) mapping[field] = found;
    });
    return mapping;
  }

  function rowHasData(row) {
    return Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '');
  }

  function worksheetToRows(sheet) {
    if (!sheet) return { rows: [], headers: [] };
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
    const headerIndex = matrix.findIndex(rowHasData);
    if (headerIndex < 0) return { rows: [], headers: [] };
    const headers = matrix[headerIndex].map((header, index) => String(header || `Columna ${index + 1}`).trim());
    const rows = XLSX.utils.sheet_to_json(sheet, { range: headerIndex, defval: '', raw: true, blankrows: false })
      .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
    return { rows, headers };
  }

  async function readExcelWorkbook(file) {
    if (!hasXlsxLibrary()) throw new Error('La librería XLSX no está disponible.');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheets = (workbook.SheetNames || []).map((name) => ({ name, ...worksheetToRows(workbook.Sheets[name]) }));
    return { workbook, sheets };
  }

  async function readExcel(file) {
    const result = await readExcelWorkbook(file);
    const sheet = result.sheets.find((item) => item.rows.length) || result.sheets[0] || { rows: [] };
    return sheet.rows;
  }

  window.CambiosIO = { EXPECTED, normalizeHeader, normalizeText, normalizeReason, toDateString, deriveRecord, duplicateKey, publicRows, sanitizeRecordForBackup, downloadBlob, exportCSV, exportJSON, exportXLSX, templateXLSX, hasXlsxLibrary, guessMapping, worksheetToRows, readExcelWorkbook, readExcel };
}());
