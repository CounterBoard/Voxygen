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
  assert.match(app,/style=\{\{height:36,boxSizing:'border-box',padding:0\}\} optionStyle=\{\{height:'100%',minHeight:0,padding:'0 12px'\}\}/);
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

test("territory rating selector matches the background, inset and active pill geometry of main tabs",()=>{
  const mainTabs=app.slice(app.indexOf("function MainTabs("),app.indexOf("function SimpleModal(",app.indexOf("function MainTabs(")));
  const home=app.slice(app.indexOf("function HomeScreen("),app.indexOf("function compressScreenshotFile"));
  assert.match(mainTabs,/background:'var\(--theme-color-surface-raised\)',borderRadius:12,padding:3/);
  assert.match(home,/background:'var\(--theme-color-surface-raised\)',borderRadius:12,padding:3,display:'grid',gridTemplateColumns:'repeat\(2,minmax\(0,1fr\)\)'/);
  assert.match(home,/indicatorStyle=\{\{top:3,bottom:3,left:3,width:'calc\(\(100% - 6px\) \/ 2\)'\}\}/);
  assert.match(home,/padding:'6px 6px',borderRadius:999,fontSize:12\.5/);
});

test("paired inspector and community rating badges have identical fixed widths and tabular numbers",()=>{
  const start=app.indexOf("function ScoreBadge(");
  const end=app.indexOf("function Segmented(",start);
  assert.ok(start>=0&&end>start);
  const badge=app.slice(start,end);
  assert.match(badge,/const badgeWidth = preset==='lg' \? 72 : preset==='recruitment' \? 62 : undefined/);
  assert.match(badge,/width:badgeWidth,minWidth:badgeWidth,boxSizing:'border-box',flexShrink:0,whiteSpace:'nowrap',fontVariantNumeric:'tabular-nums'/);
  assert.match(badge,/const color = isInspector \?/);
  assert.match(badge,/const Icon = isInspector \?/);
});
