import { useId, useState, type ReactNode } from 'react';

export function RevealRow({summary,children,label}: {summary:ReactNode;children:ReactNode;label:string}) {
  const id=useId();
  const [hover,setHover]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const open=hover||expanded;
  return <li className="facility-row reveal-row" data-open={open}
    onPointerEnter={event=>{if(event.pointerType==='mouse')setHover(true);}}
    onPointerLeave={()=>setHover(false)}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setExpanded(false);}}
    onKeyDown={event=>{if(event.key==='Escape'){setHover(false);setExpanded(false);}}}>
    <button type="button" className="facility-summary" aria-label={label} aria-expanded={open} aria-controls={id}
      onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))setExpanded(true);}}
      onClick={()=>setExpanded(value=>!value)}>{summary}<svg className="disclosure-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    <div className="facility-reveal" id={id} aria-hidden={!open} inert={!open}>
      <div className="facility-reveal-clip"><div className="facility-reveal-content">{children}</div></div>
    </div>
  </li>;
}
