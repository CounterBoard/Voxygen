import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const worker=readFileSync(new URL("../bot/src/worker.js",import.meta.url),"utf8");

test("event creation and editing are capped at two calendar months in both client and server",()=>{
  assert.match(worker,/function eventMaximumTimestamp\(now = Date\.now\(\)\)/);
  assert.match(worker,/validateEventBody\(body,\{now:actionNow\}\)/);
  assert.match(worker,/validateEventBody\(body, \{ partial: true, now: actionNow \}\)/);
  assert.match(worker,/out\.eventAt > eventMaximumTimestamp\(now\)/);
  assert.match(app,/function eventMaximumTimestamp\(now=Date\.now\(\)\)/);
  assert.match(app,/eventDateLimitError\(eventAt\)/);
});

test("event covers remain available while expanded cards avoid repeating identifying details",()=>{
  const start=app.indexOf("function renderEventCard(");
  const end=app.indexOf("function EventInlineEditor(",start);
  const card=app.slice(start,end);
  const expanded=card.slice(card.indexOf("{open &&"));
  assert.doesNotMatch(expanded,/eventDateLabel\(event\.event_at/);
  assert.doesNotMatch(expanded,/Координаты:/);
  assert.match(app,/Выбрать файл обложки|Выбрать файл/);
  assert.match(app,/Изменить обложку/);
  assert.match(app,/event\.image_data/);
  const eventSchema=worker.slice(worker.indexOf("async function initializeEventsTables"),worker.indexOf("async function getEvents"));
  assert.match(eventSchema,/image_data TEXT/);
  assert.match(eventSchema,/ALTER TABLE events ADD COLUMN image_data TEXT/);
  assert.doesNotMatch(eventSchema,/DROP COLUMN image_data/);
  const eventApi=worker.slice(worker.indexOf("function eventMaximumTimestamp"),worker.indexOf("async function notifyUsersOfNewEvent"));
  assert.match(eventApi,/imageData/);
  assert.match(eventApi,/Обложка должна быть изображением/);
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
  assert.match(worker,/const WORLD_SCHEMA_VERSION = '2026-11-v39'/);
  const worldMigration=worker.slice(worker.indexOf('async function initializeWorldTables'),worker.indexOf('function visualHasTag'));
  assert.match(worldMigration,/PRAGMA table_info\(city_customization\)/);
  assert.match(worldMigration,/ALTER TABLE city_customization ADD COLUMN banner_color TEXT NOT NULL DEFAULT 'purple'/);
  const unconditionalRepair=worldMigration.slice(0,worldMigration.indexOf("if (versionRow?.value === WORLD_SCHEMA_VERSION) return"));
  assert.match(unconditionalRepair,/CREATE TABLE IF NOT EXISTS city_customization/);
  assert.match(unconditionalRepair,/bannerColumnNames\.has\('banner_color'\)/);
  assert.match(worker,/banner_color TEXT NOT NULL DEFAULT 'purple'/);
  assert.match(worker,/bannerColor:hasBannerField\?bannerColor/);
  assert.match(worker,/cityAwards/);
  assert.match(app,/Баннер/);
  assert.match(app,/VISUAL_COLORS\.filter\(\(\[value\]\)=>value!=='none'\)/);
  assert.match(app,/inventory\?\.cityAwards/);
  assert.doesNotMatch(app,/equippedBackgroundItemId|backgroundItemId/);
  assert.doesNotMatch(app,/t\.cover_url/);
});

test("territory D1 read failures log a safe stage and the underlying database error",()=>{
  const start=worker.indexOf("async function getTerritories(");
  const end=worker.indexOf("\nasync function createTerritory(",start);
  const handler=worker.slice(start,end);
  assert.match(handler,/let failureStage = 'schema'/);
  assert.match(handler,/failureStage = 'territory-query'/);
  assert.match(handler,/failureStage = 'marker-validation'/);
  assert.match(handler,/failureStage = 'related-data'/);
  assert.match(handler,/failureStage = 'transform'/);
  assert.match(handler,/errorMessage: String\(error\?\.message/);
  assert.match(handler,/timings,/);
  assert.match(handler,/details:String\(error\)/);
});
