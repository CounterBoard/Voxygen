import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const worker=readFileSync(new URL("../bot/src/worker.js",import.meta.url),"utf8");

test("event creation and editing are capped at two calendar months in both client and server",()=>{
  assert.match(worker,/function eventMaximumTimestamp\(now = Date\.now\(\)\)/);
  assert.match(worker,/validateEventBody\(body,\{now:actionNow\}\)/);
  assert.match(worker,/validateEventBody\(body, \{ partial: true, now: actionNow \}\)/);
  assert.match(worker,/out\.eventAt > eventMaximumTimestamp\(\)/);
  assert.match(app,/function eventMaximumTimestamp\(now=Date\.now\(\)\)/);
  assert.match(app,/eventDateLimitError\(eventAt\)/);
});

test("event details are not repeated in expanded cards and event cover assets are retired",()=>{
  const start=app.indexOf("function renderEventCard(");
  const end=app.indexOf("function EventInlineEditor(",start);
  const card=app.slice(start,end);
  const expanded=card.slice(card.indexOf("{open &&"));
  assert.doesNotMatch(expanded,/eventDateLabel\(event\.event_at/);
  assert.doesNotMatch(expanded,/Координаты:/);
  assert.doesNotMatch(app,/event\.image_data/);
  assert.doesNotMatch(app,/Выбрать файл обложки|Изменить обложку/);
  const eventSchema=worker.slice(worker.indexOf("async function initializeEventsTables"),worker.indexOf("async function getEvents"));
  assert.doesNotMatch(eventSchema,/image_data TEXT/);
  assert.match(eventSchema,/ALTER TABLE events DROP COLUMN image_data/);
  const eventApi=worker.slice(worker.indexOf("function eventMaximumTimestamp"),worker.indexOf("async function notifyUsersOfNewEvent"));
  assert.doesNotMatch(eventApi,/imageData|image_data/);
});

test("bankers can set and reduce timed visual discounts with compact syntax",()=>{
  assert.match(worker,/function parseVisualDiscountCommand\(raw\)/);
  const commandPattern=/^(.+?)\s*([-+＋−]?\d{1,3})%\s*(\d+)\s*(м|мин(?:ут(?:а|ы)?)?|ч|час(?:а|ов)?)$/i;
  assert.deepEqual("Все15%2ч".match(commandPattern)?.slice(1),["Все","15","2","ч"]);
  assert.deepEqual("Все-15%2ч".match(commandPattern)?.slice(1),["Все","-15","2","ч"]);
  assert.deepEqual("Метка, Шлем 20% 30 м".match(commandPattern)?.slice(1),["Метка, Шлем","20","30","м"]);
  assert.deepEqual("Все 15% 2ч".match(commandPattern)?.slice(1),["Все","15","2","ч"]);
  assert.deepEqual("Метка, Баннеры 20% 30 м".match(commandPattern)?.slice(1),["Метка, Баннеры","20","30","м"]);
  assert.deepEqual("Все -15% 2ч".match(commandPattern)?.slice(1),["Все","-15","2","ч"]);
  assert.deepEqual("Метка, Баннеры -5% 30м".match(commandPattern)?.slice(1),["Метка, Баннеры","-5","30","м"]);
  assert.deepEqual("Метка,Баннеры-5%30м".match(commandPattern)?.slice(1),["Метка,Баннеры","-5","30","м"]);
  assert.match(worker,/text\.match\(\/\^\(\.\+\?\)\\s\*/);
  assert.match(worker,/async function applyVisualDiscountCommand/);
  assert.match(worker,/command\.delta>0\?command\.delta:Number\(current\.percent\)\+command\.delta/);
  assert.match(worker,/DELETE FROM visual_discounts WHERE item_id=\?/);
  assert.match(worker,/if\(discountCommand\)return applyVisualDiscountCommand/);
  assert.match(worker,/vd\.percent AS discount_percent/);
  const purchase=worker.slice(worker.indexOf("async function purchaseCustomizationItem"),worker.indexOf("\nasync function getTreasury",worker.indexOf("async function purchaseCustomizationItem")));
  assert.match(purchase,/effectivePrice/);
  assert.match(purchase,/balance>=\?/);
  assert.match(app,/textDecorationColor:'var\(--theme-color-status-danger\)'/);
});

test("territory banners use the Visual color palette and city awards are displayed below the marker",()=>{
  assert.match(worker,/banner_color TEXT NOT NULL DEFAULT 'purple'/);
  assert.match(worker,/bannerColor:hasBannerField\?bannerColor/);
  assert.match(worker,/cityAwards/);
  assert.match(app,/Баннер/);
  assert.match(app,/VISUAL_COLORS\.filter\(\(\[value\]\)=>value!=='none'\)/);
  assert.match(app,/inventory\?\.cityAwards/);
  assert.doesNotMatch(app,/equippedBackgroundItemId|backgroundItemId/);
  assert.doesNotMatch(app,/t\.cover_url/);
});
