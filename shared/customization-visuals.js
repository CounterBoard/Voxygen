const BANNER_PALETTE = Object.freeze({
  red: "#EF4444", orange: "#F97316", yellow: "#FACC15", green: "#22C55E",
  turquoise: "#14B8A6", blue: "#3B82F6", purple: "#8B5CF6", magenta: "#EC4899", white: "#F5F5F5",
});

export const BANNER_GRADIENT_TEMPLATES = Object.freeze([
  { id: "aurora", label: "Пиксельная мозаика" }, { id: "prism", label: "Ступенчатые блоки" },
  { id: "nebula", label: "Полутоновое поле" }, { id: "sunset", label: "Волновые контуры" },
  { id: "crystal", label: "Органические формы" }, { id: "horizon", label: "Орбитальные дуги" },
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
  const out=[];
  for(let row=0;row<13;row++){
    for(let col=0;col<29;col++){
      const wave=Math.sin(col*.39+row*.35)*.5+Math.cos(row*.64-col*.22)*.5;
      const diagonal=Math.exp(-Math.pow((col-row*1.25-8)/9,2));
      const density=.18+diagonal*.56+(wave+.4)*.16;
      if((Math.sin(col*1.19+row*.83)+Math.cos(col*.27-row*.91)+2)/4>density){
        const scale=.62+((Math.sin(col*.43+row*.57)+1)*.17);
        const width=19+scale*17,height=20+scale*18;
        const x=col*42+(42-width)/2,y=row*46+(46-height)/2;
        out.push(svgRect(x,y,width,height,t[(col*2+row*3)%4],.58+Math.max(0,wave)*.24,1.5));
      }
    }
  }
  return out.join("");
}

function renderSteppedBlocks(t) {
  const out=[];
  for(let row=0;row<8;row++){
    const y=28+row*72;
    let x=-35+(row%2)*56+Math.sin(row*.8)*18;
    let segment=0;
    while(x<1240){
      const width=92+((Math.cos(row*.7+segment*1.1)+1)*.5)*145;
      const height=14+((Math.sin(row*.65+segment*.8)+1)*.5)*12;
      const offset=Math.sin(row*.9+segment*.55)*8;
      out.push(svgRect(x,y+offset,width,height,t[(row+segment)%4],.72,3));
      x+=width+32;
      segment++;
    }
  }
  return out.join("");
}

function renderHalftone(t) {
  const out=[];
  for(let row=0;row<14;row++){
    for(let col=0;col<28;col++){
      const x=20+col*43;
      const y=18+row*44;
      const dx=(col-13.5)/13.5,dy=(row-6.5)/6.5;
      const radial=Math.max(0,1-Math.sqrt(dx*dx*.72+dy*dy*.58));
      const ripple=(Math.sin(col*.47+row*.24)+Math.cos(row*.63-col*.2)+2)/4;
      const radius=2.2+radial*5.1+ripple*1.25;
      out.push('<circle cx="'+n(x)+'" cy="'+n(y)+'" r="'+n(radius)+'" fill="'+t[(Math.floor(radial*3)+col%2)%4]+'" opacity="'+n(.5+radial*.25)+'"/>');
    }
  }
  return out.join("");
}

function renderWaveContours(t) {
  const out=[];
  for(let i=0;i<13;i++){
    const y=22+i*46;
    const amp=14+(i%3)*7;
    const d="M -60 "+n(y)+
      " C 120 "+n(y-amp)+" 210 "+n(y+amp)+" 360 "+n(y)+
      " S 590 "+n(y-amp*1.15)+" 760 "+n(y)+
      " S 1020 "+n(y+amp)+" 1260 "+n(y-amp*.25);
    out.push(svgPath(d,t[(i+1)%4],11+(i%3)*2,.82));
  }
  return out.join("");
}

function renderOrganicContours(t) {
  const out=[];
  const forms=[
    [-90,130,175,120,0], [170,470,190,125,1], [405,115,175,135,2],
    [665,475,205,130,3], [880,135,190,140,1], [1135,435,190,155,2],
    [265,300,125,100,3], [760,285,135,105,0],
  ];
  forms.forEach(([cx,cy,rx,ry,colorIndex],index)=>{
    const d="M "+n(cx-rx)+" "+n(cy)+
      " C "+n(cx-rx*.95)+" "+n(cy-ry*.85)+" "+n(cx-rx*.25)+" "+n(cy-ry*1.2)+" "+n(cx+rx*.12)+" "+n(cy-ry*.72)+
      " C "+n(cx+rx*1.15)+" "+n(cy-ry*.52)+" "+n(cx+rx*1.12)+" "+n(cy+ry*.6)+" "+n(cx+rx*.32)+" "+n(cy+ry*.8)+
      " C "+n(cx-rx*.35)+" "+n(cy+ry*1.22)+" "+n(cx-rx*1.2)+" "+n(cy+ry*.55)+" "+n(cx-rx)+" "+n(cy)+" Z";
    out.push('<path d="'+d+'" fill="'+t[colorIndex]+'" opacity="'+(.64+(index%3)*.05)+'"/>');
  });
  return out.join("");
}

function renderOrbitalArcs(t) {
  const out=[];
  const centers=[[155,255],[505,360],[930,220]];
  centers.forEach(([cx,cy],group)=>{
    for(let ring=0;ring<4;ring++){
      const rx=66+ring*43,ry=48+ring*31;
      const offsetX=(ring%2)*17,offsetY=(ring%2)*13;
      const x=cx+offsetX,y=cy+offsetY;
      const d="M "+n(x-rx)+" "+n(y)+
        " A "+n(rx)+" "+n(ry)+" 0 1 0 "+n(x+rx)+" "+n(y)+
        " A "+n(rx)+" "+n(ry)+" 0 1 0 "+n(x-rx)+" "+n(y);
      out.push('<path d="'+d+'" fill="none" stroke="'+t[(group+ring)%4]+'" stroke-width="'+(13+(ring%2)*5)+'" opacity="'+(.58+(ring%3)*.09)+'"/>');
    }
  });
  return out.join("");
}

function renderDiagonalRibbons(t) {
  const out=[];
  for(let i=0;i<12;i++){
    const x=-320+i*142;
    const width=19+(i%4)*5;
    const d="M "+n(x)+" 680 C "+n(x+130)+" 475 "+n(x+150)+" 210 "+n(x+330)+" -80";
    out.push(svgPath(d,t[i%4],width,.82));
  }
  return out.join("");
}

function renderDiamondLattice(t) {
  const out=[];
  for(let row=0;row<8;row++){
    for(let col=-1;col<14;col++){
      const x=col*84+(row%2)*42;
      const y=25+row*77;
      const scale=.78+((Math.sin(col*.34+row*.53)+1)*.5)*.27;
      const halfW=31*scale,halfH=23*scale;
      const points=[
        n(x-halfW)+","+n(y),
        n(x)+","+n(y-halfH),
        n(x+halfW)+","+n(y),
        n(x)+","+n(y+halfH)
      ].join(" ");
      out.push(svgPolygon(points,t[(row+col+20)%4],.82));
    }
  }
  return out.join("");
}

function renderVerticalZigzags(t) {
  const out=[];
  for(let col=0;col<15;col++){
    const x=32+col*82;
    const amp=11+(col%4)*4;
    const d="M "+n(x)+" -40"+
      " C "+n(x-amp)+" 80 "+n(x+amp)+" 165 "+n(x)+" 275"+
      " S "+n(x-amp)+" 455 "+n(x)+" 640";
    out.push(svgPath(d,t[col%4],13+(col%3)*3,.88));
  }
  return out.join("");
}

function renderModularMaze(t) {
  const out=[];
  const cellW=104,cellH=76;
  for(let row=0;row<8;row++){
    for(let col=0;col<12;col++){
      const x=col*cellW-12,y=row*cellH-10;
      const mode=(row*5+col*7+(row*col)%5)%4;
      const length=38+((row*11+col*13)%34);
      const thickness=10+((row+col)%3)*3;
      const color=t[(row+col*2)%4];
      if(mode===0){
        out.push(svgPath("M "+n(x)+" "+n(y+18)+" H "+n(x+length)+" V "+n(y+59),color,thickness,.86));
      }else if(mode===1){
        out.push(svgPath("M "+n(x+18)+" "+n(y)+" V "+n(y+length)+" H "+n(x+76),color,thickness,.86));
      }else if(mode===2){
        out.push(svgRect(x+12,y+20,length+28,thickness,color,.84,thickness/2));
      }else{
        const points=[n(x+12)+","+n(y+14),n(x+72)+","+n(y+14),n(x+72)+","+n(y+62),n(x+12)+","+n(y+62)].join(" ");
        out.push(svgPolygon(points,color,.76));
      }
    }
  }
  return out.join("");
}

const PATTERN_RENDERERS = Object.freeze({
  aurora: renderPixelMosaic,
  prism: renderSteppedBlocks,
  nebula: renderHalftone,
  sunset: renderWaveContours,
  crystal: renderOrganicContours,
  horizon: renderOrbitalArcs,
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
    '</defs><rect width="1200" height="600" fill="url(#base)"/>'+
    '<ellipse cx="600" cy="300" rx="760" ry="380" fill="url(#ambient)"/>'+
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
