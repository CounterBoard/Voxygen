const BANNER_PALETTE = Object.freeze({
  red: "#EF4444", orange: "#F97316", yellow: "#FACC15", green: "#22C55E",
  turquoise: "#14B8A6", blue: "#3B82F6", purple: "#8B5CF6", magenta: "#EC4899", white: "#F5F5F5",
});

export const BANNER_GRADIENT_TEMPLATES = Object.freeze([
  { id: "aurora", label: "Северное сияние" }, { id: "prism", label: "Призма" },
  { id: "nebula", label: "Туманность" }, { id: "sunset", label: "Закат" },
  { id: "crystal", label: "Кристалл" }, { id: "horizon", label: "Горизонт" },
  { id: "ribbons", label: "Ленты" }, { id: "velvet", label: "Бархат" },
  { id: "orbit", label: "Орбита" }, { id: "flare", label: "Вспышка" },
]);

const GRADIENT_LAYOUTS = Object.freeze({
  aurora:  { angle:142, spots:[[12,16,70,0.70],[88,18,58,0.52],[58,92,76,0.42]], accentHue:42 },
  prism:   { angle:28,  spots:[[6,90,64,0.62],[94,8,66,0.62],[46,34,48,0.36]], accentHue:78 },
  nebula:  { angle:168, spots:[[18,22,82,0.68],[82,72,72,0.62],[64,4,44,0.42]], accentHue:108 },
  sunset:  { angle:112, spots:[[8,6,78,0.66],[92,58,68,0.52],[35,100,58,0.38]], accentHue:-28 },
  crystal: { angle:54,  spots:[[0,45,58,0.58],[100,48,58,0.58],[50,0,58,0.42]], accentHue:160 },
  horizon: { angle:90,  spots:[[12,8,58,0.48],[90,20,64,0.48],[55,100,88,0.55]], accentHue:24 },
  ribbons: { angle:156, spots:[[8,8,64,0.62],[84,94,70,0.62],[94,18,42,0.35]], accentHue:190 },
  velvet:  { angle:18,  spots:[[4,72,82,0.66],[96,10,76,0.60],[44,18,46,0.38]], accentHue:-48 },
  orbit:   { angle:132, spots:[[50,-8,64,0.60],[104,52,74,0.55],[6,86,60,0.48]], accentHue:132 },
  flare:   { angle:38,  spots:[[2,2,76,0.72],[100,100,74,0.58],[56,44,48,0.42]], accentHue:58 },
});

function hexToRgb(value) {
  const match=String(value||"").match(/^#?([0-9a-f]{6})$/i);
  if(!match)return null;
  const hex=match[1];
  return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16)];
}
function shiftHue([r,g,b],offset) {
  const red=r/255,green=g/255,blue=b/255,max=Math.max(red,green,blue),min=Math.min(red,green,blue),delta=max-min;
  let hue=0;
  if(delta){if(max===red)hue=((green-blue)/delta)%6;else if(max===green)hue=(blue-red)/delta+2;else hue=(red-green)/delta+4;hue*=60;}
  const light=(max+min)/2,saturation=delta===0?0:delta/(1-Math.abs(2*light-1));
  const h=((hue+offset)%360+360)%360/360;
  const q=light<0.5?light*(1+saturation):light+saturation-light*saturation,p=2*light-q;
  const channel=t=>{let v=t;if(v<0)v+=1;if(v>1)v-=1;if(v<1/6)return p+(q-p)*6*v;if(v<1/2)return q;if(v<2/3)return p+(q-p)*(2/3-v)*6;return p;};
  return [channel(h+1/3),channel(h),channel(h-1/3)].map(value=>value*255);
}
function blendRgb(from,to,amount){return from.map((value,index)=>value+(to[index]-value)*amount);}
function rgba(rgb,alpha){return `rgba(${rgb.map(value=>Math.round(value)).join(",")},${alpha})`;}

export function getRandomBannerGradientId(random=Math.random) {
  const sample=typeof random==="function"?Number(random()):0;
  const safe=Number.isFinite(sample)?Math.max(0,Math.min(0.999999999,sample)):0;
  return BANNER_GRADIENT_TEMPLATES[Math.floor(safe*BANNER_GRADIENT_TEMPLATES.length)].id;
}

export function getBannerGradient(color,templateId="aurora",fallbackAccent="#8B5CF6") {
  const normalized=String(color||"none").trim().toLowerCase();
  if(normalized==="none"){
    const accent=hexToRgb(fallbackAccent)?fallbackAccent:"#8B5CF6";
    return `linear-gradient(160deg, ${accent}66, ${accent}22 72%, var(--theme-color-surface) 100%)`;
  }
  const base=hexToRgb(BANNER_PALETTE[normalized])||hexToRgb(BANNER_PALETTE.purple);
  const layout=GRADIENT_LAYOUTS[String(templateId||"aurora")]||GRADIENT_LAYOUTS.aurora;
  const accent=shiftHue(base,layout.accentHue);
  const light=blendRgb(base,[255,255,255],0.34);
  const dark=blendRgb(base,[8,12,24],0.42);
  const deep=blendRgb(accent,[8,12,24],0.38);
  const spots=layout.spots.map(([x,y,radius,opacity],index)=>{
    const tone=index===1?accent:index===2?light:base;
    return `radial-gradient(ellipse at ${x}% ${y}%, ${rgba(tone,opacity)} 0%, ${rgba(tone,opacity*0.42)} 28%, transparent ${radius}%)`;
  });
  const main=`linear-gradient(${layout.angle}deg, ${rgba(dark,0.96)} 0%, ${rgba(base,0.94)} 38%, ${rgba(accent,0.78)} 72%, ${rgba(deep,0.94)} 100%)`;
  const fade="linear-gradient(180deg, rgba(12,15,24,0.02) 0%, rgba(12,15,24,0.00) 52%, var(--theme-color-surface) 100%)";
  return [fade,...spots,main].join(", ");
}

export function formatDiscountRemaining(expiresAt,now=Date.now()) {
  const expires=Number(expiresAt),current=Number(now);
  if(!Number.isFinite(expires)||!Number.isFinite(current)||expires<=current)return "";
  const totalMinutes=Math.max(1,Math.ceil((expires-current)/60000));
  const hours=Math.floor(totalMinutes/60),minutes=totalMinutes%60;
  if(hours&&minutes)return `${hours}ч ${minutes}м`;
  if(hours)return `${hours}ч`;
  return `${minutes}м`;
}
