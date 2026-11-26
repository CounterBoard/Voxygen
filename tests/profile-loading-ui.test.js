import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../src/features/profile/useTelegramProfile.js', import.meta.url), 'utf8');
const territoriesHook = readFileSync(new URL('../src/features/territories/useTerritories.js', import.meta.url), 'utf8');

test('Telegram profile loading and nickname claiming are owned by a dedicated hook', () => {
  assert.match(app, /import \{ useTelegramProfile \} from '\.\/features\/profile\/useTelegramProfile\.js'/);
  assert.match(app, /role, profile, profileLoadState, profileLoadError, refreshProfile, claimNickname,[\s\S]*?\} = useTelegramProfile\(/);
  assert.match(app, /onTelegramIdentityChanged:[\s\S]*?setTerritories\(TERRITORIES\)[\s\S]*?loadTerritories\(\)/);
  assert.doesNotMatch(app, /async function claimNickname\(|const refreshProfile = async|profileRequestVersionRef|activeTelegramIdRef/);
  assert.match(hook, /export function useTelegramProfile\(/);
});

test('profile refresh preserves authenticated POST, timeout, visibility refresh and request deduplication', () => {
  assert.match(hook, /\/api\/me/);
  assert.match(hook, /method: 'POST'/);
  assert.match(hook, /JSON\.stringify\(\{ initData \}\)/);
  assert.match(hook, /new AbortController\(\)/);
  assert.match(hook, /15000/);
  assert.match(hook, /profileRequestInitDataRef\.current === initData/);
  assert.match(hook, /profileAbortRef\.current\?\.abort\(\)/);
  assert.match(hook, /requestVersion !== profileRequestVersionRef\.current/);
  assert.match(hook, /addEventListener\('visibilitychange', onVisible\)/);
  assert.match(hook, /setInterval\(refreshProfile, 60000\)/);
});

test('profile role and status mapping remain distinct for members, inspectors and empty profiles', () => {
  assert.match(hook, /setRole\(data\.role \|\| 'user'\)/);
  assert.match(hook, /data\.role === 'inspector' \|\| data\.role === 'main_inspector'/);
  assert.match(hook, /setProfileLoadState\('verified'\)/);
  assert.match(hook, /setProfileLoadState\('needs_nickname'\)/);
  assert.match(hook, /setProfileLoadState\('error'\)/);
  assert.match(hook, /profileLoadedOnceRef\.current/);
});

test('profile refresh reacts only to a confirmed Telegram identity change', () => {
  assert.match(hook, /responseUserId && activeTelegramIdRef\.current && responseUserId !== activeTelegramIdRef\.current/);
  assert.match(hook, /identityChangeCallbackRef\.current\?\.\(\)/);
  assert.match(app, /setTerritoriesHasLoaded\(false\)/);
  assert.match(app, /setTerritoriesError\(null\)/);
});

test('nickname claim keeps its route, payload and user-facing outcomes', () => {
  assert.match(hook, /\/api\/profile\/claim/);
  assert.match(hook, /JSON\.stringify\(\{ nickname: nick, initData \}\)/);
  assert.match(hook, /Введите ник\./);
  assert.match(hook, /Откройте приложение через Telegram\./);
  assert.match(hook, /Не удалось отправить заявку\./);
  assert.match(hook, /setProfile\(prev => \(\{ \.\.\.prev, nickname: nick, status: data\.status \|\| 'pending' \}\)\)/);
});
