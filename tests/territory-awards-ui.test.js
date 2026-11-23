import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("territory award emoji use AnimatedEmojies TGS or its own Telegram thumbnail",()=>{
  assert.match(app,/import lottie from ['"]lottie-web['"]/);
  assert.match(app,/format=animation&v=4/);
  assert.match(app,/lottie\.loadAnimation\(/);
  assert.match(app,/function cloneTelegramEmojiAnimationData\(/);
  assert.match(app,/loop:true/);
  assert.match(app,/autoplay:true/);
  assert.doesNotMatch(app,/fontSize:size\*\.94/,"device Unicode emoji font is not used for award fallback");
  assert.match(app,/<TelegramEmoji emoji=\{award\.emoji\} size=\{40\}\/\>/);
  assert.match(app,/<TelegramEmoji emoji=\{award\.emoji\} size=\{36\}\/\>/);
  assert.match(app,/<TelegramEmoji emoji=\{selectedTerritoryAward\.emoji\} size=\{56\}\/\>/);
});

test("changing one award does not disable or fade the rest of the award inventory",()=>{
  assert.match(app,/disabled=\{readOnly\|\|Boolean\(awardBusyId&&String\(awardBusyId\)===String\(award\.id\)\)\}/);
  assert.match(app,/atlas-award-inventory-card:disabled\{opacity:1!important;filter:none!important;/);
  assert.match(app,/padding:6,opacity:1\}\}/);
});

test("equipped marker tiles use the same mint fill and edge treatment as equipped awards",()=>{
  assert.match(app,/background:equipped\?'rgba\(110,231,183,\.18\)':'var\(--theme-color-surface-raised\)'/);
  assert.match(app,/boxShadow:equipped\?'inset 0 0 0 1px rgba\(110,231,183,\.2\),0 0 0 1px rgba\(110,231,183,\.12\)':'none'/);
  assert.match(app,/atlas-inventory-image--equipped\{border:2px solid #6EE7B7!important;outline:none!important;/);
});

test("award details modal follows the regular modal gap with a larger emoji",()=>{
  assert.match(app,/alignItems:'center',gap:8,padding:'0 4px 4px',textAlign:'center'/);
  assert.match(app,/title="Награда"[\s\S]*?<TelegramEmoji emoji=\{selectedTerritoryAward\.emoji\} size=\{56\}/);
});

 
test("banner preview updates optimistically and submits the exact selected color/template pair",()=>{
  const start=app.indexOf("async function changeBannerColor(value)");
  const end=app.indexOf("async function rename()",start);
  assert.ok(start>=0&&end>start);
  const handler=app.slice(start,end);
  const optimistic=handler.indexOf("setInventory(current=>current?{...current,...next}:current)");
  const request=handler.indexOf("const response=await fetch(");
  assert.ok(optimistic>=0&&request>optimistic,"preview state changes before the save request");
  assert.ok(handler.includes("bannerColor:next.bannerColor,bannerGradient:next.bannerGradient"));
  assert.ok(handler.includes("setInventory(current=>current?{...current,...previous}:current)"),"failed saves roll back the preview");
  const editor=app.slice(app.indexOf("function CityManagementProfile("),app.indexOf("function ProfileInventory("));
  const publicPage=app.slice(app.indexOf("function TerritoryDetail("),app.indexOf("function WorldMap("));
  assert.ok(editor.includes("background:getBannerGradient(inventory?.bannerColor||'none',inventory?.bannerGradient||'aurora',territory?.accent)"));
  assert.ok(publicPage.includes("background:getBannerGradient(t.banner_color||'none',t.banner_gradient||'aurora',t.accent)"));
});

 
test("Telegram award emoji clones shared TGS data per player and always autoplay-loops AnimatedEmojies",()=>{
  assert.match(app,/useState\('loading'\)/);
  assert.match(app,/format=animation&v=4/);
  assert.match(app,/loadTelegramEmojiAnimation\(value\)/);
  assert.match(app,/telegramEmojiAnimationCache\.get\(value\)/);
  assert.match(app,/function cloneTelegramEmojiAnimationData\(/);
  assert.match(app,/cloneTelegramEmojiAnimationData\(animationData\)/);
  assert.match(app,/loop:true/);
  assert.match(app,/autoplay:true/);
  assert.match(app,/animation\.goToAndPlay\(0,true\)/);
  assert.match(app,/renderMode==='unavailable'/);
  assert.doesNotMatch(app,/renderMode==='unicode'/);
  assert.doesNotMatch(app,/setRenderMode\(imageLoadedRef\.current\?'image':'unicode'\)/);
  assert.match(app,/atlas-award-emoji-enter/);
});

 
test("Telegram TGS payload validation requires a non-empty frame range",()=>{
  assert.match(app,/!\(Number\(data\.op\)>Number\(data\.ip\)\)/);
});
