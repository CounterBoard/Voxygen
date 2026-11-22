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
test("banner gradients render flowing SVG compositions in the selected color family",()=>{
  const red=getBannerGradient("red","prism"),blue=getBannerGradient("blue","prism");
  assert.match(red,/^url\("data:image\/svg\+xml,/);
  assert.notEqual(red,blue);
  const redSvg=decodeURIComponent(red.match(/data:image\/svg\+xml,([^"]+)/)[1]);
  const blueSvg=decodeURIComponent(blue.match(/data:image\/svg\+xml,([^"]+)/)[1]);
  assert.match(redSvg,/<path d="M-80 120/);
  assert.match(redSvg,/feGaussianBlur/);
  assert.match(blueSvg,/fill="#080D22"/);
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
