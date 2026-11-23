const BANNER_PALETTE = Object.freeze({
  red: "#EF4444", orange: "#F97316", yellow: "#FACC15", green: "#22C55E",
  turquoise: "#14B8A6", blue: "#3B82F6", purple: "#8B5CF6", magenta: "#EC4899", white: "#F5F5F5",
});

export const BANNER_GRADIENT_TEMPLATES = Object.freeze([
  { id: "aurora", label: "Пиксельная мозаика" }, { id: "prism", label: "Ступенчатые блоки" },
  { id: "nebula", label: "Полутоновое поле" }, { id: "sunset", label: "Волновые контуры" },
  { id: "crystal", label: "Шевронный ритм" }, { id: "horizon", label: "Горизонтальные штрихи" },
  { id: "ribbons", label: "Диагональные ленты" }, { id: "velvet", label: "Ромбическая решётка" },
  { id: "orbit", label: "Вертикальные зигзаги" }, { id: "flare", label: "Модульный лабиринт" },
]);

// Each stable template ID now describes a distinct generative geometry family.
// Colour is derived only from the selected territory colour.
function n(value) { return Number(value.toFixed(1)); }
function svgRect(x,y,width,height,fill,opacity=1,radius=0) {
  return '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(width) + '" height="' + n(height) + '" rx="' + n(radius) + '" fill="' + fill + '" opacity="' + opacity + '"/>';
}
function svgPath(d,stroke,width,opacity=1,filter="") {
  return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + n(width) + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + opacity + '"' + (filter ? ' filter="url(#' + filter + ')"' : '') + '/>';
}
function svgPolygon(points,fill,opacity=1) {
  return '<polygon points="' + points + '" fill="' + fill + '" opacity="' + opacity + '"/>';
}

function renderPixelMosaic(t) {
  const out = [];
  const colors = [t[0],t[1],t[2],t[3]];
  for (let row=0;row<18;row++) {
    for (let col=0;col<38;col++) {
      const wave=Math.sin(col*.43+row*.31)*.42+Math.cos(row*.7-col*.19)*.36+Math.sin((col-row)*.16)*.22;
      const diagonal=Math.exp(-Math.pow((col-row*1.34-10)/10,2));
      const density=.24+diagonal*.52+(wave+.2)*.19;
      if (((Math.sin(col*1.7+row*.93)+Math.cos(col*.31-row*1.1))*.5+0.55)>density) {
        const scale=.42+((Math.sin(col*.8+row*1.31)+1)*.25);
        const w=13+scale*17;
        const h=12+scale*18;
        const x=col*32+(32-w)/2;
        const y=row*34+(34-h)/2;
        const color=colors[Math.abs((col*3+row*5+Math.round(w)))%colors.length];
        const opacity=.42+Math.max(0,wave)*.42;
        out.push(svgRect(x,y,w,h,color,opacity,Math.min(3,scale*3)));
        if ((col+row)%11===0) out.push(svgRect(x+4,y+4,Math.max(3,w*.18),Math.max(3,h*.18),t[0],.8,1));
      }
    }
  }
  return out.join("");
}

function renderSteppedBlocks(t) {
  const out=[];
  for(let row=0;row<10;row++){
    const y=22+row*58;
    const offset=(row%2)*27+Math.sin(row*.8)*13;
    let x=-36+offset;
    let run=0;
    while(x<1240){
      const wave=Math.sin(row*1.13+run*.74);
      const width=66+((Math.cos(row*.8+run*1.41)+1)*.5)*126;
      const height=9+((Math.sin(row*.62+run*.9)+1)*.5)*13;
      const color=t[(row+run)%4];
      out.push(svgRect(x,y+wave*11,width,height,color,.78,Math.min(4,height/3)));
      out.push(svgRect(x+10,y+wave*11+height+3,width*.42,2,t[(row+run+1)%4],.5,1));
      if(run%3===0) out.push(svgRect(x+width-7,y-12,5,18,t[0],.52,2));
      x+=width+28+((row+run)%3)*9;
      run++;
    }
    out.push(svgPath("M 0 "+n(y+30)+" H 1200",t[4],1,.24));
  }
  return out.join("");
}

function renderHalftone(t) {
  const out=[];
  for(let row=0;row<19;row++){
    for(let col=0;col<39;col++){
      const x=15+col*31;
      const y=14+row*32;
      const dx=(col-19)/19,dy=(row-9)/9;
      const radial=Math.max(0,1-Math.sqrt(dx*dx*.75+dy*dy*.62));
      const ripple=(Math.sin(col*.57+row*.28)+Math.cos(row*.77-col*.24)+2)/4;
      const radius=1.7+radial*7.2+ripple*2.6;
      const color=t[(Math.floor(radial*3)+col%2)%4];
      out.push('<circle cx="'+n(x)+'" cy="'+n(y)+'" r="'+n(radius)+'" fill="'+color+'" opacity="'+n(.32+radial*.48)+'"/>');
      if(radius>8.4 && (row+col)%3===0) out.push('<circle cx="'+n(x)+'" cy="'+n(y)+'" r="'+n(radius*.42)+'" fill="'+t[4]+'" opacity=".45"/>');
    }
  }
  return out.join("");
}

function renderWaveContours(t) {
  const out=[];
  for(let i=0;i<17;i++){
    const y=18+i*36;
    const amp=10+(i%4)*5;
    const phase=i*.56;
    const d="M -40 "+n(y)+
      " C 130 "+n(y-amp)+ " 210 "+n(y+amp)+" 340 "+n(y)+
      " S 535 "+n(y-amp*1.1)+" 660 "+n(y)+
      " S 850 "+n(y+amp*1.15)+" 970 "+n(y)+
      " S 1120 "+n(y-amp*.85)+" 1240 "+n(y+Math.sin(phase)*4);
    out.push(svgPath(d,t[4],18,.34,"softGlow"));
    out.push(svgPath(d,t[(i+1)%4],7+(i%3)*2,.92));
    if(i%2===0) out.push(svgPath(d,t[0],1.8,.9));
  }
  return out.join("");
}

function renderChevronField(t) {
  const out=[];
  for(let row=0;row<9;row++){
    const cy=34+row*68;
    const skew=(row%2)*35;
    for(let col=-1;col<13;col++){
      const x=col*104+skew;
      const width=76+(Math.sin(row*.72+col*.4)+1)*14;
      const height=18+(Math.cos(col*.61-row*.33)+1)*8;
      const points=[
        n(x)+","+n(cy),
        n(x+width*.48)+","+n(cy-height),
        n(x+width)+","+n(cy),
        n(x+width*.48)+","+n(cy+height),
        n(x+width*.24)+","+n(cy+height*.43),
        n(x+width*.63)+","+n(cy)
      ].join(" ");
      out.push(svgPolygon(points,t[(row+col+40)%4],.86));
      if((row+col)%3===0){
        const inner=[n(x+width*.3)+","+n(cy),n(x+width*.48)+","+n(cy-height*.38),n(x+width*.66)+","+n(cy)].join(" ");
        out.push(svgPolygon(inner,t[0],.76));
      }
    }
  }
  return out.join("");
}

function renderHorizontalStripes(t) {
  const out=[];
  for(let row=0;row<23;row++){
    const y=12+row*26;
    let x=-20+((row*47)%190);
    let segment=0;
    while(x<1230){
      const modulation=(Math.sin(row*.52+segment*.91)+1)/2;
      const width=48+modulation*210+((segment+row)%4)*19;
      const height=3+((Math.cos(row*.38+segment*.73)+1)*.5)*7;
      const color=t[(row+segment)%4];
      out.push(svgRect(x,y,width,height,color,.45+modulation*.5,height/2));
      if(segment%3===0) out.push(svgRect(x+width*.68,y+height+4,width*.2,2,t[0],.56,1));
      x+=width+13+((row*segment)%18);
      segment++;
    }
  }
  return out.join("");
}

function renderDiagonalRibbons(t) {
  const out=[];
  for(let i=0;i<19;i++){
    const x=-360+i*88;
    const width=13+(i%5)*3;
    const d="M "+n(x)+" 680 C "+n(x+110)+" 490 "+n(x+145)+" 280 "+n(x+270)+" -80";
    out.push(svgPath(d,t[4],width+20,.43,"softGlow"));
    out.push(svgPath(d,t[i%4],width,.88));
    out.push(svgPath("M "+n(x+width*1.15)+" 660 C "+n(x+110+width*1.15)+" 480 "+n(x+145+width*1.15)+" 270 "+n(x+270+width*1.15)+" -60",t[0],2,.82));
  }
  for(let i=0;i<8;i++){
    const x=30+i*165;
    out.push(svgPath("M "+x+" 0 L "+(x+270)+" 600",t[1],1,.28));
  }
  return out.join("");
}

function renderDiamondLattice(t) {
  const out=[];
  for(let row=0;row<11;row++){
    for(let col=-1;col<18;col++){
      const x=col*72+(row%2)*36;
      const y=17+row*55;
      const scale=.58+((Math.sin(col*.37+row*.61)+1)*.5)*.48;
      const halfW=27*scale,halfH=15*scale;
      const points=[
        n(x-halfW)+","+n(y),
        n(x)+","+n(y-halfH),
        n(x+halfW)+","+n(y),
        n(x)+","+n(y+halfH)
      ].join(" ");
      out.push(svgPolygon(points,t[(row+col+30)%4],.82));
      if((row+col)%4===0){
        const facets=[n(x-halfW)+","+n(y),n(x)+","+n(y-halfH),n(x)+","+n(y)].join(" ");
        out.push(svgPolygon(facets,t[0],.82));
      }
    }
  }
  return out.join("");
}

function renderVerticalZigzags(t) {
  const out=[];
  for(let col=0;col<25;col++){
    const x=18+col*50;
    const amp=7+(col%5)*3;
    const d="M "+n(x)+" -30"+
      " C "+n(x-amp)+" 65 "+n(x+amp)+" 115 "+n(x)+" 180"+
      " S "+n(x-amp)+" 300 "+n(x)+" 365"+
      " S "+n(x+amp)+" 485 "+n(x)+" 545"+
      " S "+n(x-amp)+" 650 "+n(x)+" 660";
    const width=7+(col%4)*3;
    out.push(svgPath(d,t[4],width+11,.4,"softGlow"));
    out.push(svgPath(d,t[col%4],width,.93));
    if(col%2===0) out.push(svgPath(d,t[0],1.5,.76));
  }
  return out.join("");
}

function renderModularMaze(t) {
  const out=[];
  const cellW=76,cellH=72;
  for(let row=0;row<9;row++){
    for(let col=0;col<17;col++){
      const x=col*cellW-8,y=row*cellH-8;
      const key=(row*17+col);
      const mode=(row*7+col*11+(row*col)%9)%6;
      const length=28+((row*13+col*17)%43);
      const thickness=5+((row+col)%4)*2;
      const color=t[(row+col*2)%4];
      if(mode===0||mode===2||mode===4){
        out.push(svgRect(x,y+16,length,thickness,color,.9,thickness/2));
        out.push(svgRect(x+length-5,y+16,thickness,35,t[(row+col+1)%4],.82,thickness/2));
      }else if(mode===1||mode===3){
        out.push(svgRect(x+18,y,thickness,length,color,.88,thickness/2));
        out.push(svgRect(x+18,y+length-5,38,thickness,t[(row+col+2)%4],.78,thickness/2));
      }else{
        const d="M "+n(x)+" "+n(y+12)+" H "+n(x+length)+" V "+n(y+48)+" H "+n(x+length+28);
        out.push(svgPath(d,color,thickness,.9));
      }
      if(key%7===0) out.push(svgRect(x+42,y+44,16,5,t[0],.65,2));
    }
  }
  return out.join("");
}

const PATTERN_RENDERERS = Object.freeze({
  aurora: renderPixelMosaic,
  prism: renderSteppedBlocks,
  nebula: renderHalftone,
  sunset: renderWaveContours,
  crystal: renderChevronField,
  horizon: renderHorizontalStripes,
  ribbons: renderDiagonalRibbons,
  velvet: renderDiamondLattice,
  orbit: renderVerticalZigzags,
  flare: renderModularMaze,
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

export function getBannerGradientTones(color) {
  const normalized=String(color||"none").trim().toLowerCase();
  const base=hexToRgb(BANNER_PALETTE[normalized])||hexToRgb(BANNER_PALETTE.purple);
  return [
    toHex(blendRgb(base,[255,255,255],0.32)),
    toHex(shiftHue(base,-9)),
    toHex(base),
    toHex(shiftHue(base,9)),
    toHex(blendRgb(base,[7,8,20],0.38)),
  ];
}

export function getBannerGradient(color,templateId="aurora",fallbackAccent="#8B5CF6") {
  const normalized=String(color||"none").trim().toLowerCase();
  if(normalized==="none"){
    const accent=hexToRgb(fallbackAccent)?fallbackAccent:"#8B5CF6";
    return "linear-gradient(160deg, " + accent + "66, " + accent + "22 72%, var(--theme-color-surface) 100%)";
  }
  const base=hexToRgb(BANNER_PALETTE[normalized])||hexToRgb(BANNER_PALETTE.purple);
  const tones=getBannerGradientTones(normalized);
  const renderer=PATTERN_RENDERERS[String(templateId||"aurora")]||PATTERN_RENDERERS.aurora;
  const pattern=renderer(tones);
  const background=toHex(blendRgb(base,[5,6,18],0.82));
  const backgroundDeep=toHex(blendRgb(base,[3,4,12],0.9));
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice"><defs>'+
    '<linearGradient id="base" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+background+'"/><stop offset=".52" stop-color="'+backgroundDeep+'"/><stop offset="1" stop-color="'+background+'"/></linearGradient>'+
    '<linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+tones[0]+'"/><stop offset=".34" stop-color="'+tones[1]+'"/><stop offset=".68" stop-color="'+tones[2]+'"/><stop offset="1" stop-color="'+tones[3]+'"/></linearGradient>'+
    '<linearGradient id="accentReverse" x1="1" y1="0" x2="0" y2="1"><stop stop-color="'+tones[3]+'"/><stop offset=".52" stop-color="'+tones[2]+'"/><stop offset="1" stop-color="'+tones[0]+'"/></linearGradient>'+
    '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="'+background+'" stop-opacity="0"/><stop offset="1" stop-color="'+backgroundDeep+'" stop-opacity=".48"/></linearGradient>'+
    '<radialGradient id="ambient"><stop stop-color="'+tones[2]+'" stop-opacity=".18"/><stop offset="1" stop-color="'+tones[2]+'" stop-opacity="0"/></radialGradient>'+
    '<filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>'+
    '<filter id="softGlowWide" x="-45%" y="-45%" width="190%" height="190%"><feGaussianBlur stdDeviation="16"/></filter>'+
    '<pattern id="microGrid" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="'+tones[0]+'" opacity=".1"/></pattern>'+
    '</defs><rect width="1200" height="600" fill="url(#base)"/>'+
    '<ellipse cx="600" cy="300" rx="760" ry="380" fill="url(#ambient)"/>'+
    '<rect width="1200" height="600" fill="url(#microGrid)" opacity=".7"/>'+
    '<g>'+pattern+'</g>'+
    '<rect width="1200" height="600" fill="url(#shade)"/>'+
    '<rect x="1" y="1" width="1198" height="598" rx="20" fill="none" stroke="'+tones[0]+'" stroke-opacity=".12" stroke-width="2"/>'+
    '</svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") center / cover no-repeat';
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
