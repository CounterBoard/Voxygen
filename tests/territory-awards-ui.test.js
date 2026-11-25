import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const themeTokens = readFileSync(new URL("../src/theme/theme-tokens.css", import.meta.url), "utf8");

test("territory awards use their saved Telegram sticker and fall back to the original Unicode emoji",()=>{
  assert.match(app,/import lottie from ['"]lottie-web['"]/);
  assert.match(app,/function TelegramSticker\(/);
  assert.match(app,/function cloneTelegramStickerAnimationData\(/);
  assert.match(app,/function AwardEmoji\(/);
  assert.match(app,/hasThumbnail=\{Boolean\(award\.sticker_thumbnail_file_id\)\}/);
  assert.match(app,/hasThumbnail=\{Boolean\(sticker\.thumbnail_file_id\)\}/);
  assert.match(app,/const fallbackEmoji=<AwardEmoji emoji=\{emoji\} size=\{size\}\/\>/);
  assert.match(app,/format==='tgs'/);
  assert.match(app,/format==='webm'/);
  assert.match(app,/loop:true/);
  assert.match(app,/autoplay:true/);
  assert.doesNotMatch(app,/AnimatedEmojies|telegram-emoji|function TelegramEmoji/);
  assert.doesNotMatch(app,/atlas-award-emoji-enter|atlas-telegram-award-emoji/);
  assert.match(app,/<TerritoryAwardIcon award=\{award\} size=\{40\}\/\>/);
  assert.match(app,/<TerritoryAwardIcon award=\{award\} size=\{36\}\/\>/);
  assert.match(app,/<TerritoryAwardIcon award=\{selectedTerritoryAward\} size=\{56\}\/\>/);
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
  assert.match(app,/title="Награда"[\s\S]*?<TerritoryAwardIcon award=\{selectedTerritoryAward\} size=\{56\}/);
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

 
test("each TGS award gets an independent looping Lottie player without AnimatedEmojies",()=>{
  assert.match(app,/cloneTelegramStickerAnimationData\(data\)/);
  assert.match(app,/lottie\.loadAnimation\(/);
  assert.match(app,/loop:true/);
  assert.match(app,/autoplay:true/);
  assert.match(app,/animation\.addEventListener\('DOMLoaded',onAnimationReady\)/);
  assert.match(app,/animation\.addEventListener\('data_failed',onAnimationFailed\)/);
  assert.doesNotMatch(app,/loadTelegramEmojiAnimation|telegramEmojiAnimationCache|AnimatedEmojies|telegram-emoji/);
});

 
test("Telegram TGS payload validation requires a non-empty frame range",()=>{
  assert.match(app,/!\(Number\(data\.op\)>Number\(data\.ip\)\)/);
});


test("main inspector profile replaces purchases with a 9-column custom emoji pack award manager",()=>{
  assert.match(app,/\{isMainInspector\?<MainInspectorAwardManager initData=\{initData\} territories=\{territories\} onTerritoriesChanged=\{onTerritoriesChanged\}\/>/);
  assert.match(app,/function MainInspectorAwardManager\(/);
  assert.match(app,/gridTemplateColumns:'repeat\(9,minmax\(0,1fr\)\)'/);
  assert.match(app,/border:selected\?'2px solid #6EE7B7'/);
  assert.match(app,/https:\/\/t\.me\/addemoji\//);
  assert.match(app,/type="date" value=\{awardDate\}/);
  assert.match(app,/Выдать награду/);
});

test("main inspector issued awards list appears below D1 diagnostics and supports deletion",()=>{
  const diagnostics=app.indexOf("Диагностика D1");
  const issued=app.indexOf("Выданные награды");
  assert.ok(diagnostics>=0&&issued>diagnostics);
  assert.match(app,/async function loadIssuedAwards\(/);
  assert.match(app,/async function deleteIssuedAward\(/);
  assert.match(app,/\/api\/admin\/awards\/'\+encodeURIComponent\(award\.id\)/);
});

test("territory award badges center their icons and reveal each badge in sequence",()=>{
  assert.match(app,/animationDelay:`\$\{index\*75\}ms`/);
  assert.match(app,/width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',lineHeight:0/);
});

test("territory rating rows crop the matching banner from its center without scaling",()=>{
  const rating=app.slice(app.indexOf("function HomeScreen("),app.indexOf("function compressScreenshotFile"));
  assert.match(rating,/width:'100vw',height:150,left:'50%',top:'50%',transform:'translate\(-50%,-50%\)'/);
  assert.match(rating,/getBannerGradient\(t\.banner_color\|\|'none',t\.banner_gradient\|\|'aurora',t\.accent\)/);
});

test("main inspector emoji pack galleries are collapsed initially and have accessible toggles",()=>{
  assert.match(app,/useState\(\(\)=>new Set\(\)\)/);
  assert.match(app,/aria-expanded=\{expandedPackIds\.has\(String\(pack\.id\)\)\}/);
  assert.match(app,/expandedPackIds\.has\(String\(pack\.id\)\)&&<div style=\{\{display:'grid',gridTemplateColumns:'repeat\(9,minmax\(0,1fr\)\)'/);
  assert.doesNotMatch(app,/Добавьте публичный Telegram-пак пользовательских эмодзи/);
  assert.doesNotMatch(app,/Выберите один эмодзи в галерее выше/);
});

test("territory review reply has no extra bottom margin",()=>{
  const start=app.indexOf("function ReplyBox("),end=app.indexOf("function ResidentsModal(",start);
  assert.ok(start>=0&&end>start);
  assert.match(app.slice(start,end),/marginBottom:\s*0/);
});

test("equipped-award guidance is not shown in the profile and profile banner controls are not dimmed when disabled",()=>{
  assert.doesNotMatch(app,/Экипированные награды появляются на странице территории/);
  const dot=app.slice(app.indexOf("function ColorDot("),app.indexOf("function ToggleField(",app.indexOf("function ColorDot(")));
  assert.match(dot,/opacity:1,filter:'none'/);
  assert.match(app,/aria-label="Предпросмотр текущего баннера территории"[\s\S]*?opacity:1,filter:'none'/);
});

test("territories header controls and rating filter share a 36px height",()=>{
  assert.match(app,/height:36,boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'0 12px'[^>]*>\s*<Plus/);
  const home=app.slice(app.indexOf("function HomeScreen("),app.indexOf("function compressScreenshotFile"));
  assert.match(home,/background:'var\(--theme-recipe-rating-switch-track-bg\)'/);
  assert.match(home,/height:'var\(--theme-recipe-rating-switch-track-height\)'/);
  assert.match(home,/padding:'var\(--theme-recipe-rating-switch-inset\)'/);
  assert.match(home,/indicatorStyle=\{\{top:'var\(--theme-recipe-rating-switch-inset\)',bottom:'var\(--theme-recipe-rating-switch-inset\)',left:'var\(--theme-recipe-rating-switch-inset\)'/);
  assert.match(home,/borderRadius:'var\(--theme-recipe-rating-switch-indicator-radius\)'/);
  assert.match(app,/min-height:var\(--theme-control-height-compact\)/);
  assert.match(themeTokens,/--theme-control-height-compact:\s*36px/);
  assert.match(app,/label:'По инспекторам'/);
});

test("main inspector home feature button settings render the existing toggle component",()=>{
  const start=app.indexOf("function HomeFeatureButtonModal(");
  const end=app.indexOf("const TRANSPARENT_COLOR",start);
  assert.ok(start>=0&&end>start);
  const modal=app.slice(start,end);
  assert.match(modal,/<ToggleField label="Скрыть кнопку для пользователей"/);
  assert.doesNotMatch(modal,/<SettingsToggle\b/);
});

test("Vox theme owns the rating switch geometry and the component consumes those tokens",()=>{
  const selectorStart=themeTokens.indexOf('.atlas-root[data-theme="vox"]');
  const selectorEnd=themeTokens.indexOf('\n}',selectorStart);
  assert.ok(selectorStart>=0&&selectorEnd>selectorStart);
  const vox=themeTokens.slice(selectorStart,selectorEnd);
  const compactHeight=Number(vox.match(/--theme-control-height-compact:\s*(\d+)px/)?.[1]);
  const inset=Number(vox.match(/--theme-recipe-rating-switch-inset:\s*(\d+)px/)?.[1]);
  const innerRadius=Number(vox.match(/--theme-recipe-rating-switch-indicator-radius:\s*(\d+)px/)?.[1]);
  assert.equal(compactHeight,36);
  assert.equal(inset,3);
  assert.equal(innerRadius,compactHeight/2);
  assert.equal(innerRadius+inset,21);
  assert.match(vox,/--theme-recipe-rating-switch-track-height:\s*calc\(var\(--theme-recipe-rating-switch-indicator-height\) \+ var\(--theme-recipe-rating-switch-inset\) \+ var\(--theme-recipe-rating-switch-inset\)\)/);
  assert.match(vox,/--theme-recipe-rating-switch-track-radius:\s*calc\(var\(--theme-recipe-rating-switch-indicator-radius\) \+ var\(--theme-recipe-rating-switch-inset\)\)/);
  const home=app.slice(app.indexOf("function HomeScreen("),app.indexOf("function compressScreenshotFile"));
  assert.match(home,/borderRadius:'var\(--theme-recipe-rating-switch-track-radius\)'/);
  assert.match(home,/indicatorStyle=\{\{top:'var\(--theme-recipe-rating-switch-inset\)'/);
});

test("rating badges retain their original content-sized geometry without forced widths",()=>{
  const start=app.indexOf("function ScoreBadge(");
  const end=app.indexOf("function Segmented(",start);
  assert.ok(start>=0&&end>start);
  const badge=app.slice(start,end);
  assert.doesNotMatch(badge,/badgeWidth|width:|minWidth:|fontVariantNumeric|whiteSpace:'nowrap'/);
  assert.match(badge,/gap: token\('gap'\)/);
  assert.match(badge,/padding: token\('padding'\)/);
  assert.match(badge,/minHeight:token\('height'\),fontSize:token\('size'\)/);
  assert.match(badge,/const color = isInspector \?/);
  assert.match(badge,/const Icon = isInspector \?/);
});





test("territory award TGS stickers show their Telegram thumbnail until animation becomes ready",()=>{
  const start=app.indexOf("function TelegramSticker(");
  const end=app.indexOf("function TerritoryAwardIcon(",start);
  assert.ok(start>=0&&end>start);
  const component=app.slice(start,end);
  assert.match(component,/const previewSrc=API_BASE\+'\/api\/telegram-sticker\?'\+query\+'&preview=1'/);
  assert.match(component,/if\(format==='tgs'\)[\s\S]*?<img src=\{previewSrc\}/);
  assert.match(component,/display:animationReady\|\|previewFailed\?'none':'block'/);
  assert.match(component,/animation\.addEventListener\('DOMLoaded',onAnimationReady\)/);
  assert.match(component,/animation\.addEventListener\('data_failed',onAnimationFailed\)/);
});

test("territory award WEBM stickers fall back to the same Telegram thumbnail when video playback fails",()=>{
  const start=app.indexOf("function TelegramSticker(");
  const end=app.indexOf("function TerritoryAwardIcon(",start);
  const component=app.slice(start,end);
  assert.match(component,/if\(format==='webm'\)[\s\S]*?<video src=\{src\}/);
  assert.match(component,/failed&&hasThumbnail&&<img src=\{previewSrc\}/);
  assert.match(component,/failed&&\(!hasThumbnail\|\|previewFailed\)&&fallbackEmoji/);
});
