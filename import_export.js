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
    const text = normalizeText(reason);
    if (/fracaso|virolog|rebote|virem|resist/.test(text)) return 'Fracaso virológico';
    if (/advers|toxic|intoler|renal|hepatic|rash|nause|diarrea|efecto/.test(text)) return 'Efecto adverso';
    if (/interaccion|interacci|contraind|farmaco|medicament/.test(text)) return 'Interacción';
    if (/optim|simplific|biterapia|mejora|actualiz|comodidad|adherencia|switch|cambio proactivo/.test(text)) return 'Optimización';
    return 'Otro';
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

  function deriveRecord({ fecha, patient_id, tar_antiguo, tar_nuevo, motivo_original, origen, id }) {
    const date = toDateString(fecha);
    const d = new Date(`${date}T00:00:00`);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const quarter = Math.floor((month - 1) / 3) + 1;
    const oldTar = String(tar_antiguo || '').trim();
    const newTar = String(tar_nuevo || '').trim();
    const motivo = String(motivo_original || '').trim();
    return {
      id: id || (crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}-${Math.random()}`),
      fecha: date,
      patient_id,
      tar_antiguo: oldTar,
      tar_nuevo: newTar,
      motivo_original: motivo,
      anio: year,
      mes: month,
      trimestre: quarter,
      transicion_tar: `${oldTar} → ${newTar}`,
      motivo_normalizado: normalizeReason(motivo),
      origen,
      fecha_creacion: new Date().toISOString()
    };
  }

  function duplicateKey(record) {
    return [record.patient_id, record.fecha, record.tar_antiguo, record.tar_nuevo, record.motivo_original].map((v) => String(v || '').trim().toLowerCase()).join('|');
  }

  function publicRows(records) {
    return records.map((r) => ({
      Fecha: r.fecha,
      'Patient ID seudonimizado': r.patient_id,
      'TAR antiguo': r.tar_antiguo,
      'TAR nuevo': r.tar_nuevo,
      'Transición TAR': r.transicion_tar,
      'Motivo original': r.motivo_original,
      'Motivo normalizado': r.motivo_normalizado,
      Origen: r.origen,
      Año: r.anio,
      Mes: r.mes,
      Trimestre: r.trimestre,
      'Fecha de creación': r.fecha_creacion
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
    downloadBlob(JSON.stringify({ app: 'cambiosTAR', exported_at: new Date().toISOString(), records }, null, 2), filename, 'application/json');
  }

  function exportXLSX(records, filename = 'cambiosTAR_registros.xlsx') {
    if (!window.XLSX) return exportCSV(records, filename.replace(/\.xlsx$/i, '.csv'));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(publicRows(records));
    XLSX.utils.book_append_sheet(wb, ws, 'Registros');
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

  window.CambiosIO = { EXPECTED, normalizeReason, toDateString, deriveRecord, duplicateKey, publicRows, downloadBlob, exportCSV, exportJSON, exportXLSX, templateXLSX, guessMapping, readExcel };
}());
