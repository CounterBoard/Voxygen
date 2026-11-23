import test from "node:test";
import assert from "node:assert/strict";
import { BANNER_GRADIENT_TEMPLATES, getBannerGradient, getBannerGradientTones, getRandomBannerGradientId, formatDiscountRemaining } from "../shared/customization-visuals.js";

function decodeGradient(value) {
  const match=String(value).match(/data:image\/svg\+xml,([^"]+)/);
  assert.ok(match,"Gradient should contain an encoded SVG data URL");
  return decodeURIComponent(match[1]);
}
function rgbToHue(hex) {
  const value=hex.replace("#","");
  const [r,g,b]=[0,2,4].map(index=>parseInt(value.slice(index,index+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if(!delta)return 0;
  let hue;
  if(max===r)hue=((g-b)/delta)%6;
  else if(max===g)hue=(b-r)/delta+2;
  else hue=(r-g)/delta+4;
  return (hue*60+360)%360;
}
function hueDistance(a,b) {
  const diff=Math.abs(a-b);
  return Math.min(diff,360-diff);
}

test("banner gradient catalogue keeps ten stable IDs with names matching the new pattern families",()=>{
  const ids=BANNER_GRADIENT_TEMPLATES.map(item=>item.id);
  assert.deepEqual(ids,["aurora","prism","nebula","sunset","crystal","horizon","ribbons","velvet","orbit","flare"]);
  assert.equal(BANNER_GRADIENT_TEMPLATES.length,10);
  assert.ok(BANNER_GRADIENT_TEMPLATES.some(item=>item.label==="Пиксельная мозаика"));
  assert.ok(BANNER_GRADIENT_TEMPLATES.some(item=>item.label==="Шевронный ритм"));
  assert.ok(BANNER_GRADIENT_TEMPLATES.some(item=>item.label==="Горизонтальные штрихи"));
  assert.ok(BANNER_GRADIENT_TEMPLATES.some(item=>item.label==="Диагональные фрагменты"));
  assert.ok(BANNER_GRADIENT_TEMPLATES.some(item=>item.label==="Треугольная мозаика"));
  assert.ok(BANNER_GRADIENT_TEMPLATES.some(item=>item.label==="Модульный лабиринт"));
});
test("random banner gradient selection covers the first and last template safely",()=>{
  assert.equal(getRandomBannerGradientId(()=>0),"aurora");
  assert.equal(getRandomBannerGradientId(()=>0.999999),"flare");
  assert.equal(getRandomBannerGradientId(()=>Number.NaN),"aurora");
});
test("all ten templates generate distinct abstract SVG compositions while retaining the original eight patterns",()=>{
  const svgs=BANNER_GRADIENT_TEMPLATES.map(item=>decodeGradient(getBannerGradient("turquoise",item.id)));
  assert.equal(new Set(svgs).size,10,"all ten templates must have distinct geometries");
  for(const svg of svgs){
    assert.match(svg,/viewBox="0 0 1200 600"/);
    const marks=(svg.match(/<(?:path|rect|circle|polygon)\b/g)||[]).length;
    const minimumMarks=["crystal","horizon"].includes(BANNER_GRADIENT_TEMPLATES[svgs.indexOf(svg)].id)?10:55;
    assert.ok(marks>=minimumMarks,"patterns should retain their intended visual structure");
    assert.match(svg,/linearGradient id="base"/);
    assert.match(svg,/feGaussianBlur/);
  }
  assert.match(svgs[0],/<rect /,"pixel mosaic is made of vector tiles");
  assert.doesNotMatch(svgs[0],/opacity="0.8"\/>/,"pixel mosaic has no inset square highlights");
  assert.match(svgs[2],/<circle /,"halftone field is made of dots");
  assert.match(svgs[3],/<path /,"wave contours are vector paths");
  assert.match(svgs[4],/<path /,"chevron template is replaced by organic curves");
  assert.match(svgs[5],/ A /,"horizontal stripe template is replaced by orbital arcs");
  assert.equal((svgs[7].match(/<polygon/g)||[]).length,209,"diamond lattice has one flat polygon per diamond without inset facets");
});
test("banner tone family stays close to the selected territory colour",()=>{
  for(const colour of ["red","orange","yellow","green","turquoise","blue","purple","magenta"]){
    const tones=getBannerGradientTones(colour);
    assert.equal(tones.length,5);
    const baseHue=rgbToHue(tones[2]);
    for(const tone of tones){
      assert.ok(hueDistance(rgbToHue(tone),baseHue)<=9.5,"derived shade should stay within nine degrees of selected hue");
    }
  }
  assert.equal(getBannerGradientTones("red")[2],"#ef4444");
  assert.equal(getBannerGradientTones("blue")[2],"#3b82f6");
  const redSvg=decodeGradient(getBannerGradient("red","ribbons"));
  assert.match(redSvg,/stop-color="#ef4444"/i);
  assert.doesNotMatch(redSvg,/stop-color="#3B82F6"|stop-color="#22C55E"/);
});
test("unselected banner colour and unknown template retain safe fallbacks",()=>{
  assert.match(getBannerGradient("none","aurora","#22C55E"),/#22C55E66/);
  assert.match(getBannerGradient("unknown","missing"),/^url\("data:image\/svg\+xml,/);
});
test("discount timer uses compact hours and minutes and rounds up partial minutes",()=>{
  const now=1_000_000;
  assert.equal(formatDiscountRemaining(now+121*60_000,now),"2ч 1м");
  assert.equal(formatDiscountRemaining(now+120*60_000,now),"2ч");
  assert.equal(formatDiscountRemaining(now+60_000,now),"1м");
  assert.equal(formatDiscountRemaining(now+1,now),"1м");
  assert.equal(formatDiscountRemaining(now,now),"");
  assert.equal(formatDiscountRemaining(now-1,now),"");
});
