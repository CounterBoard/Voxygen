import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const management = readFileSync(new URL('../src/features/territory-management/CityManagementProfile.jsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/features/territory-details/TerritoryDetail.jsx', import.meta.url), 'utf8');

const toastStart = app.indexOf('function FixedToast(');
const toastEnd = app.indexOf('\nfunction AvatarHead(', toastStart);
const fixedToast = app.slice(toastStart, toastEnd);

test('FixedToast restarts the lifetime when an identical notification is emitted again', () => {
  assert.match(fixedToast, /function FixedToast\(\{ message, type = null, revision = 0 \}\)/);
  assert.match(fixedToast, /\},\[message,type,revision\]\);/);
  assert.match(fixedToast, /const duration=type==='error'\?4300:2600/);
  assert.match(fixedToast, /clearTimeout\(exitTimer\)/);
  assert.match(fixedToast, /clearTimeout\(hideTimer\)/);
});

test('the four-award limit toast uses a monotonically increasing revision instead of a remount key', () => {
  assert.match(management, /setAwardLimitToast\(value=>value\+1\)/);
  assert.match(management, /<FixedToast revision=\{awardLimitToast\} message="Максимум 4 награды на странице территории" type="error"\/>/);
  assert.doesNotMatch(management, /<FixedToast key=\{awardLimitToast\}/);
});

test('other repeating profile and territory notices also carry an explicit revision', () => {
  assert.match(management, /<FixedToast revision=\{noticeRevision\} message=\{notice\} type=\{noticeType\}\/>/);
  assert.match(management, /<FixedToast revision=\{noticeRevision\} message=\{notice\}\/>/);
  assert.match(detail, /const \[toastRevision,setToastRevision\]=useState\(0\)/);
  assert.match(detail, /function flash\(message\) \{ setToast\(message\); setToastRevision\(value=>value\+1\); \}/);
  assert.match(detail, /<FixedToast revision=\{toastRevision\} message=\{toast\}\/>/);
  assert.doesNotMatch(detail, /setTimeout\(\(\) => setToast\(null\)/);
});

test('root notifications use revisions and cancel an earlier home-toast timeout before scheduling another', () => {
  assert.match(app, /const \[homeToastRevision,setHomeToastRevision\]=useState\(0\)/);
  assert.match(app, /if\(homeToastTimerRef\.current!==null\)clearTimeout\(homeToastTimerRef\.current\)/);
  assert.match(app, /setHomeToastRevision\(value=>value\+1\)/);
  assert.match(app, /homeToastTimerRef\.current=setTimeout\(\(\)=>\{setHomeToast\(null\);homeToastTimerRef\.current=null;\},duration\)/);
  assert.match(app, /<FixedToast revision=\{homeToastRevision\} message=\{homeToast\} \/>/);
  assert.match(app, /<FixedToast revision=\{globalToast\.id\} message=\{globalToast\.message\} type=\{globalToast\.type\} \/>/);
  assert.doesNotMatch(app, /<FixedToast key=\{/);
  assert.match(app, /useEffect\(\(\)=>\(\)=>\{if\(homeToastTimerRef\.current!==null\)clearTimeout\(homeToastTimerRef\.current\)\},\[\]\)/);
});

test('main inspector and treasury notices can repeat the same text without reusing a stale timer', () => {
  const mainStart = app.indexOf('function MainInspectorPanel(');
  const mainEnd = app.indexOf('\nfunction MainInspectorManagersModal(', mainStart);
  const mainPanel = app.slice(mainStart, mainEnd);
  const treasuryStart = app.indexOf('function TreasuryCard(');
  const treasuryEnd = app.indexOf('\nfunction ToggleField(', treasuryStart);
  const treasury = app.slice(treasuryStart, treasuryEnd);
  assert.match(mainPanel, /const showNotice=\(message\)=>\{setNotice\(message\);setNoticeRevision\(value=>value\+1\)\}/);
  assert.match(mainPanel, /<FixedToast revision=\{noticeRevision\} message=\{notice\}\/>/);
  assert.match(treasury, /setNoticeRevision\(value=>value\+1\)/);
  assert.match(treasury, /<FixedToast revision=\{noticeRevision\} message=\{notice\}\/>/);
});
