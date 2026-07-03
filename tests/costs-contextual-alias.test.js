const assert = require('assert');

global.window = { CambiosIO: { toDateString: (v) => v } };
require('../costs.js');
const C = window.CambiosCosts;

function row(codigo_tar, coste_anual_eur) {
  return { codigo_tar, nombre_tar: codigo_tar, componentes: codigo_tar, coste_anual_eur, fecha_inicio_vigencia: '2020-01-01', fecha_fin_vigencia: '', import_batch_id: 'test' };
}
function state(catalog) { return { catalog, aliases: [], activeBatchId: 'test', importedAt: '2026-01-01' }; }
const catalog = [row('BIC/FTC/TAF', 6000), row('CAB/RPV LA', 7000), row('DTG/RPV', 6500)];

{
  const result = C.calculate({ fecha: '2026-05-25', tar_antiguo: 'BIC/FTC/TAF', tar_nuevo: 'RPV' }, state(catalog));
  assert.equal(result.coste_calculable, 'si');
  assert.equal(result.tar_nuevo_usado_calculo, 'CAB/RPV LA');
  assert.equal(result.alias_contextual_aplicado, 'si');
  assert.equal(result.alias_contextual_regla, 'RPV_TO_CAB_RPV_LA_FROM_2024');
  assert.equal(result.coste_anual_tar_nuevo_eur, 7000);
  assert.equal(result.impacto_economico, 'sobrecoste');
}
{
  const result = C.calculate({ fecha: '2023-12-31', tar_antiguo: 'BIC/FTC/TAF', tar_nuevo: 'RPV' }, state(catalog));
  assert.equal(result.alias_contextual_aplicado, 'no');
  assert.equal(result.tar_nuevo_usado_calculo, 'RPV');
  assert.equal(result.coste_calculable, 'no');
}
{
  const result = C.calculate({ fecha: '2024-01-01', tar_antiguo: 'BIC/FTC/TAF', tar_nuevo: ' rPv ' }, state(catalog));
  assert.equal(result.alias_contextual_aplicado, 'si');
  assert.equal(result.tar_nuevo_usado_calculo, 'CAB/RPV LA');
}
{
  const result = C.calculate({ fecha: '2026-05-25', tar_antiguo: 'BIC/FTC/TAF', tar_nuevo: 'DTG/RPV' }, state(catalog));
  assert.equal(result.alias_contextual_aplicado, 'no');
  assert.equal(result.tar_nuevo_usado_calculo, 'DTG/RPV');
  assert.equal(result.coste_anual_tar_nuevo_eur, 6500);
}
{
  const result = C.calculate({ fecha: '2026-05-25', tar_antiguo: 'RPV', tar_nuevo: 'BIC/FTC/TAF' }, state(catalog));
  assert.equal(result.alias_contextual_aplicado, 'no');
  assert.equal(result.tar_nuevo_usado_calculo, 'BIC/FTC/TAF');
  assert.equal(result.coste_calculable, 'no');
  assert.equal(result.tar_anterior_normalizado_coste, 'rpv');
}
{
  const result = C.calculate({ fecha: '2026-05-25', tar_antiguo: 'BIC/FTC/TAF', tar_nuevo: 'RPV' }, state([row('BIC/FTC/TAF', 6000)]));
  assert.equal(result.alias_contextual_aplicado, 'no');
  assert.equal(result.alias_contextual_regla, 'RPV_TO_CAB_RPV_LA_FROM_2024');
  assert.match(result.alias_contextual_motivo, /no se encontró CAB\/RPV LA/);
}

console.log('costs contextual alias tests passed');
