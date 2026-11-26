import React, { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config/api.js';

function cloneTelegramStickerAnimationData(animationData) {
  if(typeof structuredClone==='function')return structuredClone(animationData);
  return JSON.parse(JSON.stringify(animationData));
}

export function AwardEmoji({emoji,size=32,style={}}) {
  const value=String(emoji||'✨');
  return <span role="img" aria-label={value} style={{width:size,height:size,display:'inline-flex',alignItems:'center',justifyContent:'center',flex:'0 0 auto',fontSize:Math.round(size*.88),lineHeight:1,...style}}>{value}</span>;
}

export function TelegramSticker({stickerId,awardId,format='image',emoji='',size=32,style={},preview=false,hasThumbnail=true}) {
  const animationRef=useRef(null);
  const [failed,setFailed]=useState(false);
  const [animationReady,setAnimationReady]=useState(false);
  const [previewFailed,setPreviewFailed]=useState(false);
  const id=String(awardId||stickerId||'');
  const query=new URLSearchParams(awardId?{awardId:String(awardId)}:{stickerId:String(stickerId||'')}).toString();
  const src=API_BASE+'/api/telegram-sticker?'+query+(preview&&hasThumbnail?'&preview=1':'');
  const previewSrc=API_BASE+'/api/telegram-sticker?'+query+'&preview=1';
  useEffect(()=>{
    if((preview&&hasThumbnail)||format!=='tgs'||!id)return undefined;
    let cancelled=false,animation=null;
    setFailed(false);
    setAnimationReady(false);
    setPreviewFailed(false);
    const onAnimationReady=()=>{
      if(cancelled)return;
      setFailed(false);
      setAnimationReady(true);
    };
    const onAnimationFailed=()=>{
      if(cancelled)return;
      setFailed(true);
      setAnimationReady(false);
    };
    fetch(src,{cache:'force-cache'}).then(async response=>{
      if(!response.ok)throw new Error('Sticker animation unavailable');
      const data=await response.json();
      if(!Array.isArray(data?.layers)||!(Number(data.op)>Number(data.ip)))throw new Error('Invalid sticker animation');
      if(cancelled||!animationRef.current)return;
      const lottieModule=await import('lottie-web');
      if(cancelled||!animationRef.current)return;
      animation=lottieModule.default.loadAnimation({
        container:animationRef.current,
        renderer:'svg',
        loop:true,
        autoplay:true,
        animationData:cloneTelegramStickerAnimationData(data),
        rendererSettings:{preserveAspectRatio:'xMidYMid meet'},
      });
      animation.addEventListener('DOMLoaded',onAnimationReady);
      animation.addEventListener('data_failed',onAnimationFailed);
      if(animation.isLoaded)Promise.resolve().then(onAnimationReady);
    }).catch(()=>{if(!cancelled)onAnimationFailed();});
    return ()=>{
      cancelled=true;
      animation?.destroy();
      animationRef.current?.replaceChildren();
    };
  },[src,format,id,preview]);
  const fallbackEmoji=<AwardEmoji emoji={emoji} size={size}/>;
  if(!id)return fallbackEmoji;
  const wrapperStyle={width:size,height:size,display:'inline-flex',alignItems:'center',justifyContent:'center',flex:'0 0 auto',position:'relative',overflow:'hidden',...style};
  if(preview&&hasThumbnail)return <span role="img" aria-label={emoji||'Награда'} style={wrapperStyle}><img src={src} alt="" loading="lazy" onError={()=>setFailed(true)} style={{width:'100%',height:'100%',objectFit:'contain',display:failed?'none':'block'}}/>{failed&&fallbackEmoji}</span>;
  if(format==='tgs')return <span role="img" aria-label={emoji||'Анимированная награда'} style={wrapperStyle}>
    {hasThumbnail&&<img src={previewSrc} alt="" loading="lazy" onError={()=>setPreviewFailed(true)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain',display:animationReady||previewFailed?'none':'block'}}/>}
    <div ref={animationRef} aria-hidden="true" style={{position:'absolute',inset:0,width:'100%',height:'100%',visibility:animationReady?'visible':'hidden'}}/>
    {/* Keep the slot visually quiet while the animation is loading. Unicode is only a failure fallback. */}
    {failed&&(!hasThumbnail||previewFailed)&&fallbackEmoji}
  </span>;
  if(format==='webm')return <span role="img" aria-label={emoji||'Награда'} style={wrapperStyle}>
    <video src={src} autoPlay loop muted playsInline aria-hidden="true" onError={()=>setFailed(true)} style={{width:'100%',height:'100%',objectFit:'contain',display:failed?'none':'block'}}/>
    {failed&&hasThumbnail&&<img src={previewSrc} alt="" loading="lazy" onError={()=>setPreviewFailed(true)} style={{width:'100%',height:'100%',objectFit:'contain',display:previewFailed?'none':'block'}}/>}
    {failed&&(!hasThumbnail||previewFailed)&&fallbackEmoji}
  </span>;
  return <span role="img" aria-label={emoji||'Награда'} style={wrapperStyle}><img src={src} alt="" loading="lazy" onError={()=>setFailed(true)} style={{width:'100%',height:'100%',objectFit:'contain',display:failed?'none':'block'}}/>{failed&&fallbackEmoji}</span>;
}

export function TerritoryAwardIcon({award,size=32,style={},preview=false}) {
  if(award?.sticker_format&&award?.id) {
    return <TelegramSticker key={'award-'+String(award.id)} awardId={award.id} format={award.sticker_format} emoji={award.emoji} size={size} style={style} preview={preview} hasThumbnail={Boolean(award.sticker_thumbnail_file_id)}/>;
  }
  return <AwardEmoji emoji={award?.emoji} size={size} style={style}/>;
}
