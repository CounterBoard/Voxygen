import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../bot/src/worker.js', import.meta.url), 'utf8');
const purchase = readFileSync(new URL('../bot/src/features/customization/purchase-service.js', import.meta.url), 'utf8');

test('completed visual purchases notify the configured banker, not the main inspector', () => {
  assert.match(worker, /async function notifyBankerOfPurchase\(env, details\)/);
  assert.match(worker, /const chatId = String\(env\.BANKER_TELEGRAM_ID \|\| ''\)\.trim\(\)/);
  assert.match(purchase, /await notifyBankerOfPurchase\(env,/);
  assert.doesNotMatch(worker, /notifyMainInspectorOfPurchase/);
  assert.match(worker, /formatTelegramNickname\(buyerName\)/);
});

test('territory-funded purchases retain a separate opted-in manager expense notice', () => {
  assert.match(purchase, /notifyTerritoryManagers\(env,accountCity\.id,notice,userId,\{managersOnly:true\}\)/);
});
