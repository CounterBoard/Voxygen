import React, { useEffect, useRef } from 'react';
import { VOXYGEN_EVENT_MONTHS, EVENT_TIME_ZONE, defaultEventDateParts, defaultGlobalExpiryDateParts, eventZonedParts } from './date-time.js';

export function EventWheelColumn({ label, value, options, onChange }) {
  const scrollerRef=useRef(null), syncRef=useRef(false), interactionRef=useRef(false), settleRef=useRef(null);
  const rowHeight=36, foundIndex=options.findIndex(option=>Number(option.value)===Number(value));
  const selectedIndex=Math.max(0,foundIndex);
  useEffect(()=>{
    const node=scrollerRef.current;if(!node)return;
    syncRef.current=true;node.scrollTop=selectedIndex*rowHeight;
    const frame=requestAnimationFrame(()=>{syncRef.current=false;});
    return ()=>cancelAnimationFrame(frame);
  },[selectedIndex,options.length]);
  useEffect(()=>()=>{if(settleRef.current)clearTimeout(settleRef.current);},[]);
  function scheduleSettle(){
    if(settleRef.current)clearTimeout(settleRef.current);
    // Wait until the finger has lifted and native inertia/snap has stopped.
    settleRef.current=setTimeout(()=>{
      const node=scrollerRef.current;if(!node)return;
      const index=Math.max(0,Math.min(options.length-1,Math.round(node.scrollTop/rowHeight)));
      const option=options[index];
      if(option&&Number(option.value)!==Number(value))onChange(option.value);
    },190);
  }
  function handleScroll(){if(syncRef.current||interactionRef.current)return;scheduleSettle();}
  function startInteraction(){interactionRef.current=true;if(settleRef.current)clearTimeout(settleRef.current);}
  function endInteraction(){interactionRef.current=false;scheduleSettle();}
  function choose(option,index){
    if(settleRef.current)clearTimeout(settleRef.current);
    if(Number(option.value)!==Number(value))onChange(option.value);
    const node=scrollerRef.current;if(node){syncRef.current=true;node.scrollTop=index*rowHeight;requestAnimationFrame(()=>{syncRef.current=false;});}
  }
  return <label style={{display:'block',minWidth:0,flex:1}}>
    <span style={{display:'block',fontSize:10.5,color:'var(--theme-color-text-muted)',fontWeight:750,textAlign:'center',marginBottom: 4}}>{label}</span>
    <div style={{position:'relative',height:108,borderRadius:12,overflow:'hidden',background:'var(--theme-color-surface-raised)',border:'1px solid var(--theme-color-border)'}}>
      <div aria-hidden="true" style={{position:'absolute',zIndex:1,left:4,right:4,top:36,height:36,borderRadius:9,border:'1px solid var(--theme-color-action-primary-border)',background:'var(--theme-color-action-primary-soft)',pointerEvents:'none'}}/>
      <div ref={scrollerRef} onScroll={handleScroll} onPointerDown={startInteraction} onPointerUp={endInteraction} onPointerCancel={endInteraction} onTouchStart={startInteraction} onTouchEnd={endInteraction} role="listbox" aria-label={label} aria-activedescendant={`${label}-${value}`} tabIndex={0} style={{position:'relative',height:108,overflowY:'auto',overscrollBehaviorY:'contain',scrollSnapType:'y mandatory',scrollbarWidth:'none',touchAction:'pan-y',boxSizing:'border-box'}}>
        <div aria-hidden="true" style={{height:36,scrollSnapAlign:'none'}}/>
        {options.map((option,index)=><div key={option.value} id={`${label}-${option.value}`} role="option" aria-selected={Number(option.value)===Number(value)} onClick={()=>choose(option,index)} style={{height:36,boxSizing:'border-box',display:'flex',alignItems:'center',justifyContent:'center',scrollSnapAlign:'center',fontSize:label==='Месяц'?11:(Number(option.value)===Number(value)?15:13),fontWeight:Number(option.value)===Number(value)?850:550,color:Number(option.value)===Number(value)?'var(--theme-color-text-primary)':'var(--theme-color-text-muted)',userSelect:'none',cursor:'pointer'}}>{option.label}</div>)}
        <div aria-hidden="true" style={{height:36,scrollSnapAlign:'none'}}/>
      </div>
      <div aria-hidden="true" style={{position:'absolute',zIndex:2,inset:0,pointerEvents:'none',background:'linear-gradient(to bottom,var(--theme-color-surface-raised) 0%,transparent 25%,transparent 75%,var(--theme-color-surface-raised) 100%)',opacity:.56}}/>
    </div>
  </label>;
}
export function EventDateTimeFields({ parts, onChange, includeYear = false, timezoneOffset = EVENT_TIME_ZONE }) {
  const safe=parts|| (includeYear ? defaultGlobalExpiryDateParts(timezoneOffset) : defaultEventDateParts(timezoneOffset));
  const currentYear=Number(eventZonedParts(Date.now(),timezoneOffset)?.year)||new Date().getFullYear();
  const selectedYear=Number(safe.year)||currentYear;
  const selectedMonth=Number(safe.month)||1;
  const daysInSelectedMonth=new Date(Date.UTC(selectedYear,selectedMonth,0)).getUTCDate();
  function setPart(key,value) {
    const next={...safe,[key]:Number(value)};
    if(key==='month'||key==='year') {
      const dayLimit=new Date(Date.UTC(Number(next.year)||selectedYear,Number(next.month)||selectedMonth,0)).getUTCDate();
      next.day=Math.min(Number(next.day||1),dayLimit);
    }
    onChange(next);
  }
  const fields=[
    ...(includeYear?[{key:'year',label:'Год',options:Array.from({length:11},(_,i)=>({value:currentYear+i,label:String(currentYear+i)}))}]:[]),
    {key:'day',label:'День',options:Array.from({length:daysInSelectedMonth},(_,i)=>({value:i+1,label:String(i+1).padStart(2,'0')}))},
    {key:'month',label:'Месяц',options:VOXYGEN_EVENT_MONTHS.map((label,i)=>({value:i+1,label}))},
    {key:'hour',label:'Часы',options:Array.from({length:24},(_,i)=>({value:i,label:String(i).padStart(2,'0')}))},
    {key:'minute',label:'Минуты',options:Array.from({length:60},(_,i)=>({value:i,label:String(i).padStart(2,'0')}))},
  ];
  return <div style={{display:'flex',gap: includeYear?4:6,marginTop: 4,padding: 8,background:'var(--theme-color-surface)',border:'1px solid var(--theme-color-border)',borderRadius:15}}>
    {fields.map(field=><EventWheelColumn key={field.key} label={field.label} value={safe[field.key]} options={field.options} onChange={value=>setPart(field.key,value)}/>)}
  </div>;
}
