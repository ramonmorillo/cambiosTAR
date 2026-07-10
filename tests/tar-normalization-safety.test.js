const assert = require('assert');

global.window = {};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
require('../normalization.js');
const N = window.CambiosNormalize;

function med(nombre, principio_activo = '') { return { nombre, principio_activo, fuente: 'test' }; }
function regimen(meds) { return N.buildNormalizedRegimen(meds).pauta; }

assert.equal(regimen([med('EMTRICITABINA/TENOFOVIR DISOPROXILO STADA 200 MG/245 MG', 'emtricitabina/tenofovir disoproxilo'), med('TIVICAY 50 MG', 'dolutegravir')]), 'FTC/TDF + DTG');
assert.notEqual(regimen([med('EMTRICITABINA/TENOFOVIR DISOPROXILO STADA 200 MG/245 MG', 'emtricitabina/tenofovir disoproxilo'), med('TIVICAY 50 MG', 'dolutegravir')]), 'BIC/FTC/TAF + DTG + FTC/TDF');
assert.deepEqual(N.normalizeDrugToComponents(med('TIVICAY 50 MG', 'dolutegravir')).map((x) => x.pauta), ['DTG']);
assert.deepEqual(N.normalizeDrugToComponents(med('EMTRICITABINA/TENOFOVIR DISOPROXILO STADA', 'emtricitabina/tenofovir disoproxilo')).map((x) => x.pauta), ['FTC/TDF']);
assert.equal(regimen([med('BIKTARVY', 'bictegravir/emtricitabina/tenofovir alafenamida')]), 'BIC/FTC/TAF');
assert.equal(regimen([med('BIKTARVY', 'bictegravir/emtricitabina/tenofovir alafenamida'), med('TIVICAY', 'dolutegravir')]), 'BIC/FTC/TAF + DTG');
assert.equal(regimen([med('DESCOVY', 'emtricitabina/tenofovir alafenamida'), med('TIVICAY', 'dolutegravir')]), 'FTC/TAF + DTG');
assert.equal(regimen([med('TRUVADA', 'emtricitabina/tenofovir disoproxilo'), med('TIVICAY', 'dolutegravir')]), 'FTC/TDF + DTG');
assert.equal(regimen([med('DOVATO', 'dolutegravir/lamivudina')]), 'DTG/3TC');
assert.equal(regimen([med('TRIUMEQ', 'dolutegravir/abacavir/lamivudina')]), 'DTG/ABC/3TC');
assert.equal(regimen([med('DELSTRIGO', 'doravirina/lamivudina/tenofovir disoproxilo')]), 'DOR/3TC/TDF');
assert.equal(regimen([med('PIFELTRO', 'doravirina')]), 'DOR');
assert.equal(regimen([med('VOCABRIA + REKAMBYS desde 2024', 'cabotegravir/rilpivirina larga duración')]), 'CAB/RPV LA');
assert.notEqual(regimen([med('EDURANT antes de 2024', 'rilpivirina')]), 'CAB/RPV LA');
assert.equal(regimen([med('EDURANT antes de 2024', 'rilpivirina')]), 'RPV');

let selected = [med('BIKTARVY', 'bictegravir/emtricitabina/tenofovir alafenamida'), med('TIVICAY', 'dolutegravir')];
selected = selected.filter((m) => !m.nombre.includes('BIKTARVY'));
assert.equal(regimen(selected), 'DTG');
selected = [med('EMTRICITABINA/TENOFOVIR DISOPROXILO STADA', 'emtricitabina/tenofovir disoproxilo'), med('TIVICAY', 'dolutegravir')];
selected = selected.filter((m) => !m.nombre.includes('TIVICAY'));
assert.equal(regimen(selected), 'FTC/TDF');

console.log('tar normalization safety tests passed');
