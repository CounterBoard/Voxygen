import test from "node:test";
import assert from "node:assert/strict";
import { BANNER_GRADIENT_TEMPLATES, getBannerGradient, getRandomBannerGradientId, formatDiscountRemaining } from "../shared/customization-visuals.js";

test("banner gradient catalogue contains ten stable and unique templates",()=>{
  const ids=BANNER_GRADIENT_TEMPLATES.map(item=>item.id);
  assert.equal(ids.length,10);
  assert.equal(new Set(ids).size,10);
  assert.ok(ids.includes("aurora"));
  assert.ok(ids.includes("flare"));
});
test("random banner gradient selection covers the first and last template safely",()=>{
  assert.equal(getRandomBannerGradientId(()=>0),"aurora");
  assert.equal(getRandomBannerGradientId(()=>0.999999),"flare");
  assert.equal(getRandomBannerGradientId(()=>Number.NaN),"aurora");
});
test("banner gradient uses the selected color and falls back for legacy none values",()=>{
  const red=getBannerGradient("red","prism"),blue=getBannerGradient("blue","prism");
  assert.match(red,/^linear-gradient\(180deg/);
  assert.notEqual(red,blue);\n  assert.match(decodeURIComponent(red.match(/data:image\\/svg\\+xml,([^"]+)/)[1]),/<path d="M-80 120/);\n  assert.match(decodeURIComponent(blue.match(/data:image\\/svg\\+xml,([^"]+)/)[1]),/fill="#080D22"/);
  assert.match(getBannerGradient("none","aurora","#22C55E"),/#22C55E66/);
  assert.match(getBannerGradient("unknown","missing"),/^url\\("data:image\\/svg\\+xml,/);
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
