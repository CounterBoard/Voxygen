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

// Each template describes a deliberate composition of flowing vector ribbons.
// Color is derived from the selected palette color; templates never randomize hues.
const GRADIENT_SHAPES = Object.freeze({
  aurora: [
    "M-80 390 C120 260 230 290 390 355 S650 490 820 360 S1080 175 1280 260",
    "M-90 300 C110 170 250 205 410 280 S665 420 830 290 S1080 100 1280 185",
    "M-80 470 C150 350 280 365 440 425 S680 555 860 430 S1090 270 1280 345",
  ],
  prism: [
    "M-80 120 C180 250 280 440 500 430 S830 100 1280 180",
    "M-80 210 C170 340 300 520 520 510 S850 180 1280 270",
    "M-80 35 C170 160 300 350 520 345 S850 25 1280 105",
  ],
  nebula: [
    "M-80 430 C150 330 230 100 460 145 S760 470 930 380 S1120 190 1280 230",
    "M-80 510 C160 410 260 190 480 230 S770 545 950 455 S1120 280 1280 315",
    "M-80 340 C150 245 245 25 450 75 S745 370 920 285 S1110 100 1280 145",
  ],
  sunset: [
    "M-80 455 C160 360 260 380 410 420 C600 470 690 320 830 270 S1080 230 1280 300",
    "M-80 510 C160 420 260 440 420 480 C600 525 700 380 850 330 S1080 290 1280 360",
    "M-80 380 C150 285 260 305 405 350 C590 405 680 255 820 205 S1080 165 1280 230",
  ],
  crystal: [
    "M-80 350 C130 180 270 175 410 300 S650 515 790 365 S1050 120 1280 250",
    "M-80 440 C130 270 280 265 425 390 S660 590 810 450 S1060 220 1280 335",
    "M-80 260 C130 90 260 85 395 205 S640 425 775 270 S1040 35 1280 155",
  ],
  horizon: [
    "M-80 360 C180 330 300 340 440 355 S700 380 850 350 S1100 320 1280 345",
    "M-80 430 C180 400 300 410 440 425 S700 450 850 420 S1100 390 1280 415",
    "M-80 285 C180 255 300 265 440 280 S700 305 850 275 S1100 245 1280 270",
  ],
  ribbons: [
    "M-80 520 C150 400 240 170 440 205 S730 520 910 390 S1100 100 1280 135",
    "M-80 445 C150 325 250 95 450 130 S740 445 920 315 S1110 25 1280 60",
    "M-80 590 C150 470 230 245 430 280 S720 590 900 465 S1100 175 1280 210",
  ],
  velvet: [
    "M-80 180 C140 260 240 480 450 465 S750 160 930 185 S1120 330 1280 290",
    "M-80 265 C140 345 250 565 465 550 S760 245 945 270 S1120 415 1280 375",
    "M-80 95 C140 175 235 390 435 380 S740 75 915 100 S1120 245 1280 205",
  ],
  orbit: [
    "M-80 430 C100 130 340 40 570 150 S900 540 1120 390 S1210 240 1280 180",
    "M-80 500 C120 200 355 110 590 220 S915 610 1140 460 S1220 310 1280 250",
    "M-80 350 C80 55 325 -35 550 75 S880 465 1100 315 S1200 165 1280 105",
  ],
  flare: [
    "M-80 500 C150 440 300 300 470 270 S760 260 900 180 S1100 65 1280 40",
    "M-80 570 C150 510 300 370 485 340 S770 330 915 250 S1110 135 1280 110",
    "M-80 420 C150 360 290 220 455 190 S750 180 885 100 S1090 -15 1280 -40",
  ],
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
function toHex(rgb){return `#${rgb.map(value=>Math.round(value).toString(16).padStart(2,"0")).join("")}`;}

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
  const shape=GRADIENT_SHAPES[String(templateId||"aurora")]||GRADIENT_SHAPES.aurora;
  const tones=[
    toHex(blendRgb(base,[255,255,255],0.48)),
    toHex(shiftHue(base,-24)),
    toHex(base),
    toHex(shiftHue(base,22)),
  ];
  const paths=shape.map((d,index)=>{
    const color=tones[index+1];
    const width=[178,118,62][index];
    const opacity=[0.16,0.28,0.68][index];
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}" filter="url(#blur)"/><path d="${d}" fill="none" stroke="url(#ribbon${index})" stroke-width="${Math.max(18,width*0.34)}" stroke-linecap="round" opacity="${[0.24,0.42,0.76][index]}" filter="url(#ribbonBlur)"/>`;
  }).join("");
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id="ribbon0" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${tones[0]}"/><stop offset=".48" stop-color="${tones[1]}"/><stop offset="1" stop-color="${tones[2]}"/></linearGradient>
    <linearGradient id="ribbon1" x1="0" y1="1" x2="1" y2="0"><stop stop-color="${tones[1]}"/><stop offset=".52" stop-color="${tones[2]}"/><stop offset="1" stop-color="${tones[3]}"/></linearGradient>
    <linearGradient id="ribbon2" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${tones[0]}"/><stop offset=".5" stop-color="${tones[2]}"/><stop offset="1" stop-color="${tones[3]}"/></linearGradient>
    <filter id="blur" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="34"/></filter>
    <filter id="ribbonBlur" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="11"/></filter>
    <radialGradient id="ambient"><stop stop-color="${tones[2]}" stop-opacity=".22"/><stop offset="1" stop-color="${tones[2]}" stop-opacity="0"/></radialGradient>
  </defs><rect width="1200" height="600" fill="#080D22"/><ellipse cx="590" cy="80" rx="720" ry="340" fill="url(#ambient)"/>${paths}<rect y="430" width="1200" height="170" fill="url(#shade)"/><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#080D22" stop-opacity="0"/><stop offset="1" stop-color="#080D22" stop-opacity=".62"/></linearGradient></defs></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / cover no-repeat`;
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
