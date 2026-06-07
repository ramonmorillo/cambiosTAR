(function () {
  const EXPECTED = {
    fecha: ['fecha', 'marca temporal', 'timestamp', 'date'],
    historia: ['número de historia clínico', 'numero de historia clinico', 'número de historia clínica', 'numero de historia clinica', 'historia', 'nhc'],
    tar_antiguo: ['tar antiguo', 'tratamiento antiguo', 'pauta antigua'],
    tar_nuevo: ['tar nuevo', 'tratamiento nuevo', 'pauta nueva'],
    motivo: ['motivo', 'razón', 'razon', 'causa']
  };

  function normalizeText(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

  function deriveRecord({ fecha, patient_id, tar_antiguo, tar_nuevo, motivo_original, motivo_normalizado, motivo_detalle, origen, id, fecha_creacion, tar_antiguo_original, tar_antiguo_normalizado, tar_nuevo_original, tar_nuevo_normalizado }) {
    const date = toDateString(fecha);
    const d = new Date(`${date}T00:00:00`);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const oldOriginal = String(tar_antiguo_original ?? tar_antiguo ?? '').trim();
    const newOriginal = String(tar_nuevo_original ?? tar_nuevo ?? '').trim();
    const oldNorm = tar_antiguo_normalizado ? { original: oldOriginal, normalizado: tar_antiguo_normalizado, reconocido: true } : window.CambiosNormalize.normalizeTar(oldOriginal);
    const newNorm = tar_nuevo_normalizado ? { original: newOriginal, normalizado: tar_nuevo_normalizado, reconocido: true } : window.CambiosNormalize.normalizeTar(newOriginal);
    const motivo = String(motivo_original || motivo_detalle || motivo_normalizado || '').trim();
    const classified = motivo_normalizado ? { motivo_normalizado, motivo_detalle: motivo_detalle || '', motivo_original: motivo, clasificado: true } : window.CambiosNormalize.classifyReason(motivo);
    const normalizedReason = window.CambiosNormalize.MOTIVOS.includes(classified.motivo_normalizado) ? classified.motivo_normalizado : 'Otros';
    const detail = normalizedReason === 'Otros' ? String(motivo_detalle || classified.motivo_detalle || motivo).trim() : String(motivo_detalle || classified.motivo_detalle || '').trim();
    return {
      id: id || (crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}-${Math.random()}`),
      fecha: date,
      patient_id,
      tar_antiguo_original: oldOriginal,
      tar_antiguo_normalizado: oldNorm.normalizado,
      tar_nuevo_original: newOriginal,
      tar_nuevo_normalizado: newNorm.normalizado,
      tar_antiguo: oldNorm.normalizado,
      tar_nuevo: newNorm.normalizado,
      motivo_original: motivo,
      motivo_normalizado: normalizedReason,
      motivo_detalle: detail,
      tar_antiguo_reconocido: Boolean(oldNorm.reconocido),
      tar_nuevo_reconocido: Boolean(newNorm.reconocido),
      motivo_clasificado: Boolean(classified.clasificado || motivo_normalizado),
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
      origen: r.origen,
      fecha_creacion: r.fecha_creacion,
      anio: r.anio,
      mes: r.mes,
      trimestre: r.trimestre,
      pendiente_revision: (!r.tar_antiguo_reconocido || !r.tar_nuevo_reconocido || !r.motivo_clasificado) ? 'Sí' : 'No'
    }));
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
    downloadBlob(JSON.stringify({ app: 'cambiosTAR', exported_at: new Date().toISOString(), records, custom_tar_dictionary: window.CambiosNormalize.getCustomDictionary() }, null, 2), filename, 'application/json');
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

  function guessMapping(headers) {
    const mapping = {};
    Object.entries(EXPECTED).forEach(([field, aliases]) => {
      const found = headers.find((h) => aliases.includes(normalizeText(h)) || aliases.some((a) => normalizeText(h).includes(normalizeText(a))));
      if (found) mapping[field] = found;
    });
    return mapping;
  }

  function readExcel(file) {
    return file.arrayBuffer().then((buffer) => {
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { defval: '' });
    });
  }

  window.CambiosIO = { EXPECTED, normalizeText, normalizeReason, toDateString, deriveRecord, duplicateKey, publicRows, downloadBlob, exportCSV, exportJSON, exportXLSX, templateXLSX, guessMapping, readExcel };
}());
