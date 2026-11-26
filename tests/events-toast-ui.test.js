import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const events = readFileSync(new URL('../src/features/events/Events.jsx', import.meta.url), 'utf8');

test('event-screen notifications restart their lifetime for repeated identical messages', () => {
  const screenStart = events.indexOf('export function EventsScreen(');
  const createStart = events.indexOf('function ProfileEventCreateForm(', screenStart);
  const screen = events.slice(screenStart, createStart);
  assert.match(screen, /noticeRevision,setNoticeRevision\]=useState\(0\)/);
  assert.match(screen, /const showNotice=\(message\)=>\{setNotice\(message\);setNoticeRevision\(value=>value\+1\)\}/);
  assert.match(screen, /<FixedToast revision=\{noticeRevision\} message=\{notice\}/);
  assert.doesNotMatch(screen, /<FixedToast key=\{/);
});

test('repeating reminder and event feedback goes through the revision-aware notice helper', () => {
  assert.match(events, /showNotice\('Напоминание сохранено'\)/);
  assert.match(events, /showNotice\('Это время напоминания уже прошло'\)/);
  assert.match(events, /showNotice\('Напоминание удалено'\)/);
  assert.match(events, /showNotice\('Ивент обновлён'\)/);
  assert.match(events, /showNotice\('Ивент удалён'\)/);
});

test('event create, inline edit and management date-limit toasts all use event revisions', () => {
  assert.equal((events.match(/dateLimitToastRevision,setDateLimitToastRevision/g) || []).length, 3);
  assert.equal((events.match(/<FixedToast revision=\{dateLimitToastRevision\}/g) || []).length, 3);
  assert.equal((events.match(/setDateLimitToast\(value=>value\+1\);setDateLimitToastRevision\(value=>value\+1\)/g) || []).length, 6);
  assert.doesNotMatch(events, /<FixedToast key=\{/);
});

test('event creation success can repeat with the same text and still restarts its toast', () => {
  const start = events.indexOf('function ProfileEventCreateForm(');
  const end = events.indexOf('function EventInlineEditor(', start);
  const form = events.slice(start, end);
  assert.match(form, /noticeRevision,setNoticeRevision\]=useState\(0\)/);
  assert.match(form, /setNotice\(data\?\.replayed\?'Ивент уже был создан ранее\. Повтор не создал копию\.':'Ивент создан'\);setNoticeRevision\(value=>value\+1\)/);
  assert.match(form, /<FixedToast revision=\{noticeRevision\} message=\{notice\}/);
});
