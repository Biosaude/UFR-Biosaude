import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const basesSource = await readFile(new URL('../api/bases.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const modalSource = await readFile(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');

test('auditoria é gravada antes de latest e sua falha preserva a versão publicada', () => {
  const auditWrite = basesSource.indexOf('await putBlob(`ufr/${module}/audit/${payload.version}.json`');
  const latestWrite = basesSource.indexOf('await putBlob(`ufr/${module}/latest.json`');
  assert.ok(auditWrite >= 0 && latestWrite > auditWrite);
  assert.match(basesSource.slice(auditWrite, latestWrite), /catch[\s\S]*A versão atual foi preservada/);
});

test('confirmação possui trava síncrona e controles ficam bloqueados durante loading', () => {
  assert.match(mainSource, /if \(operationInFlight\.current \|\| !pending \|\| !pendingFile\) return; operationInFlight\.current = true/);
  assert.match(modalSource, /disabled=\{loading \|\| !!report\.errors\.length\}/);
  assert.match(modalSource, /loading \? 'Processando…' : 'Confirmar atualização'/);
  assert.match(mainSource, /if \(operationInFlight\.current \|\| loading\) return/);
});

test('bases publicadas são atualizadas a cada 60 segundos e o intervalo é limpo', () => {
  assert.match(mainSource, /window\.setInterval\([\s\S]*60_000\)/);
  assert.match(mainSource, /window\.clearInterval\(interval\)/);
  assert.match(mainSource, /Os dados atuais foram preservados/);
});

test('falha inicial é exibida e não é representada como base ausente', () => {
  assert.match(mainSource, /As bases publicadas estão temporariamente indisponíveis/);
  assert.match(mainSource, /Utilizado: 'Indisponível', Faturado: 'Indisponível', Recebido: 'Indisponível'/);
  assert.match(mainSource, /baseLoadError && <div className="error-box"/);
});
