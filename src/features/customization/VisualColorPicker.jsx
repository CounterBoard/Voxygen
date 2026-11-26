import React from 'react';

export const VISUAL_COLORS=[['none','none'],['red','#EF4444'],['orange','#F97316'],['yellow','#FACC15'],['green','#22C55E'],['turquoise','#14B8A6'],['blue','#3B82F6'],['purple','#8B5CF6'],['magenta','#EC4899'],['white','#F5F5F5']];
export function ColorDot({value,selected,onClick,small=false,title,disabled=false}) {
  const isNone=value==='none';
  const c=isNone?'transparent':(VISUAL_COLORS.find(x=>x[0]===value)?.[1]||'#fff');
  return <button type="button" onClick={onClick} disabled={disabled} title={title||(isNone?'Без цвета':value)} aria-label={title||(isNone?'Без цвета':value)} className="press" style={{
    width:26,height:26,borderRadius:'50%',border:selected?'2px solid #6EE7B7':'1px solid var(--theme-color-border)',
    background:c,position:'relative',padding: 0,opacity:1,filter:'none'
  }}>
    {isNone&&<span style={{position:'absolute',left:'50%',top:'50%',width:17,height:2,background:'#9AA2C2',transform:'translate(-50%,-50%) rotate(-45deg)',transformOrigin:'center'}}/>}
  </button>
}
