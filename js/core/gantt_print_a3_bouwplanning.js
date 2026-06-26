/* CWS Planning - BWS/Bouwplanning A3 print renderer, full-page SVG, robust bars (V142) */
(function(){
  "use strict";
  const MARKER="CWS_BWS_PRINT_A3_RENDERER_V142";
  const SCRIPT_ID="cwsBwsPrintA3RendererScript";
  const SCRIPT_SRC="/js/core/gantt_print_a3_bouwplanning.js?v=142";
  if(window.__CWS_BWS_PRINT_A3_RENDERER__===MARKER) return;
  window.__CWS_BWS_PRINT_A3_RENDERER__=MARKER;
  try{document.documentElement.dataset.cwsBwsPrintA3Renderer=MARKER;}catch(_){}

  const MONTHS=["Januari","Februari","Maart","April","Mei","Juni","Juli","Augustus","September","Oktober","November","December"];
  const LEGENDS=["BWS Bouw","Dak- en wandmontage","Staalbouwer","Buitenkozijnen","Installateur W","Dakdekker","Grondwerk/infra","Betonvloer","Uithardingstijd","Trapleverancier","OH-deuren","Dekvloeren"];
  const LEGEND_COLORS=["#0b71bd","#00d169","#302e6e","#8b35c9","#168fb0","#f28c00","#b57a28","#ce2525","#ffffff","#9e2a2a","#00b050","#ffff00"];
  const PAL=["#0b71bd","#00d169","#302e6e","#8b35c9","#168fb0","#f28c00","#ce2525","#00b050","#ffff00","#9e2a2a","#b57a28","#111827"];
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pad=n=>String(n).padStart(2,"0");
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function toDate(v){
    if(v instanceof Date&&isFinite(v)) return new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate()));
    if(!v) return null;
    const s=String(v).trim().slice(0,10);
    let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if(m) return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
    m=s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); if(m) return new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));
    m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(m) return new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));
    return null;
  }
  function iso(v){const d=toDate(v); return d?`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`:"";}
  function nl(v){const d=toDate(v); return d?`${pad(d.getUTCDate())}-${pad(d.getUTCMonth()+1)}-${d.getUTCFullYear()}`:"—";}
  function add(v,n){const d=toDate(v)||new Date(); d.setUTCDate(d.getUTCDate()+Number(n||0)); return iso(d);}
  function diff(a,b){const da=toDate(a),db=toDate(b); return da&&db?Math.round((db-da)/86400000):0;}
  function weekStart(v){const d=toDate(v)||new Date(); const w=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()-w+1); return iso(d);}
  function weekInfo(v){const d=toDate(v)||new Date(); const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())); const day=x.getUTCDay()||7; x.setUTCDate(x.getUTCDate()+4-day); const yearStart=new Date(Date.UTC(x.getUTCFullYear(),0,1)); return {year:x.getUTCFullYear(),week:Math.ceil((((x-yearStart)/86400000)+1)/7)};}
  function CWS(){try{return window.CWS||(window.parent&&window.parent!==window&&window.parent.CWS)||null;}catch(_){return window.CWS||null;}}
  function getState(){return CWS()?.getState?.()||{};}
  function clone(x){try{return JSON.parse(JSON.stringify(x??null));}catch(_){return x;}}
  function projectList(s){const by=s?.projects?.byId||{}; const order=Array.isArray(s?.projects?.order)?s.projects.order:Object.keys(by); return order.map(id=>by[id]).filter(Boolean);}
  function projectId(s){const ps=projectList(s); const ids=new Set(ps.map(p=>String(p.id||""))); const cand=[document.getElementById("projectSel")?.value,document.getElementById("mobileProjectSel")?.value,s?.ui?.globalSearchTarget?.projectId,s?.ganttV2?.ui?.projectId,ps[0]?.id].filter(Boolean).map(String); return cand.find(id=>ids.has(id))||ps[0]?.id||null;}
  function projectName(p){return p?.name||p?.title||p?.omschrijving||p?.description||"Project";}
  function clientName(p){return p?.client||p?.opdrachtgever||p?.customer||p?.klant||"";}
  function projectNo(p){return p?.nr||p?.code||p?.number||p?.projectnummer||p?.id||"—";}
  function companyLogo(s){return s?.company?.logo?.dataUrl||CWS()?.getCompanyLogo?.()||"";}
  function resources(s){return s?.resources?.byId||{};}
  function ganttModel(pid,s){let m=null; try{m=CWS()?.gantt?.getProjectGantt?.(pid);}catch(_){} m=m||s?.ganttV2?.byProject?.[pid]||{}; m=clone(m)||{}; m.rows=Array.isArray(m.rows)?m.rows.filter(Boolean):[]; m.sched=m.sched&&typeof m.sched==="object"?m.sched:{}; return m;}
  function isPhase(r){const t=String(r?.type||r?.kind||"").toLowerCase(); return t==="summary"||t==="phase"||t==="fase"||r?.summary===true||r?.isPhase===true;}
  function indent(r){const n=Number(r?.level??r?.indent??0); return isFinite(n)?Math.max(0,n):0;}
  function clean(start,end){start=iso(start); end=iso(end); if(start&&!end)end=start; if(end&&!start)start=end; if(start&&end&&diff(start,end)<0){const t=start; start=end; end=t;} return start&&end?{start,end}:null;}
  function domSchedule(r){
    const id=String(r?.id||"");
    const bar=Array.from(document.querySelectorAll(".bar[data-id]")).find(el=>String(el.dataset?.id||"")===id);
    let sc=clean(bar?.dataset?.start||bar?.getAttribute?.("data-start"),bar?.dataset?.end||bar?.getAttribute?.("data-end"));
    if(sc) return sc;
    const row=Array.from(document.querySelectorAll("#tableRows tr[data-id],tbody tr[data-id]")).find(el=>String(el.dataset?.id||"")===id);
    const inputs=Array.from(row?.querySelectorAll?.('input[type="date"],input.dateinput,input[data-k="start"],input[data-k="end"]')||[]);
    const start=inputs.find(i=>String(i.dataset?.k||i.name||"").toLowerCase().includes("start"))?.value||inputs[0]?.value;
    const end=inputs.find(i=>String(i.dataset?.k||i.name||"").toLowerCase().includes("end"))?.value||inputs[1]?.value;
    return clean(start,end)||clean(r?.start||r?.startDate||r?.begin||r?.from,r?.end||r?.endDate||r?.einde||r?.to);
  }
  function rawSchedule(r,m){const sc=m?.sched?.[r?.id]||{}; return clean(sc.start||sc.startDate||sc.from||r?.start||r?.startDate||r?.begin,sc.end||sc.endDate||sc.to||r?.end||r?.endDate||r?.einde)||domSchedule(r)||{};}
  function blockEnd(rows,i){const base=indent(rows[i]); let end=i; for(let j=i+1;j<rows.length;j++){if(rows[j]?.parent&&rows[i]?.id&&String(rows[j].parent)===String(rows[i].id)){end=j; continue;} if(indent(rows[j])<=base)break; end=j;} return end;}
  function rebuildPhases(rows,map){for(let i=rows.length-1;i>=0;i--){const r=rows[i]; if(!isPhase(r))continue; const kids=rows.slice(i+1,blockEnd(rows,i)+1).map(k=>map.get(k.id)).filter(x=>x?.start&&x?.end); if(kids.length)map.set(r.id,{start:kids.map(x=>x.start).sort()[0],end:kids.map(x=>x.end).sort().at(-1)});}}
  function baseDate(p){return iso(p?.startDate||p?.start||p?.date)||weekStart(new Date());}
  function buildSchedules(rows,m,p){
    const map=new Map(); rows.forEach(r=>{const sc=rawSchedule(r,m); if(sc?.start&&sc?.end)map.set(r.id,sc);}); rebuildPhases(rows,map);
    let cursor=baseDate(p);
    rows.forEach((r,i)=>{
      if(map.get(r.id)?.start&&map.get(r.id)?.end)return;
      if(isPhase(r))return;
      const dur=Math.max(1,Number(r?.duration||r?.days||r?.duur||r?.workdays||5)||5);
      const start=add(cursor,i===0?0:2);
      const end=add(start,dur-1);
      map.set(r.id,{start,end,generated:true});
      cursor=end;
    });
    rebuildPhases(rows,map);
    return map;
  }
  function discipline(r,s){const res=r?.resourceId?resources(s)[r.resourceId]:null; return r?.bouwkundig||r?.discipline||r?.department||r?.dept||r?.afdeling||res?.dept||r?.resource||r?.resourceId||"—";}
  function resourceLabel(r,s){const res=r?.resourceId?resources(s)[r.resourceId]:null; return res?.name||r?.resourceName||r?.resource||r?.resourceId||discipline(r,s);}
  function barColor(r,i,s){const label=String(resourceLabel(r,s)||"").toLowerCase(); const ix=LEGENDS.findIndex(x=>label.includes(x.toLowerCase())); return ix>=0?LEGEND_COLORS[ix]:PAL[i%PAL.length];}
  function isNonWork(s,d){const x=toDate(d); if(!x)return false; const wd=x.getUTCDay()===0?7:x.getUTCDay(); if(wd>=6)return true; const cal=s?.settings?.calendar||{}; if(cal?.workweek&&cal.workweek[wd]===false)return true; if(typeof cal?.overrides?.[d]==="boolean")return cal.overrides[d]; return false;}
  function makeDays(start,end){const out=[]; for(let d=start,g=0;g<190&&diff(d,end)<=0;d=add(d,1),g++)out.push(d); return out;}
  function buildRange(rows,map,p){
    const dates=[]; rows.forEach(r=>{const sc=map.get(r.id); if(sc?.start)dates.push(sc.start); if(sc?.end)dates.push(sc.end);});
    let start=dates.length?dates.slice().sort()[0]:baseDate(p);
    let end=dates.length?dates.slice().sort().at(-1):add(start,98);
    start=weekStart(add(start,-7)); end=add(weekStart(add(end,14)),6);
    if(!start||!end||diff(start,end)<7){start=weekStart(baseDate(p)); end=add(start,111);}
    if(diff(start,end)+1<84)end=add(start,111);
    if(diff(start,end)+1>168)end=add(start,167);
    let days=makeDays(start,end);
    if(!days.length){start=weekStart(new Date()); end=add(start,111); days=makeDays(start,end);}
    return {start,end,days};
  }
  function model(){
    const s=getState(); const pid=projectId(s); const p=s?.projects?.byId?.[pid]||projectList(s)[0]||{}; const m=ganttModel(pid,s);
    const rawRows=m.rows.length?m.rows:[{id:"empty",name:"Geen Gantt-regels beschikbaar",type:"summary",department:"—"}];
    const sched=buildSchedules(rawRows,m,p); const range=buildRange(rawRows,sched,p);
    const rows=rawRows.map((r,i)=>{let sc=sched.get(r.id)||rawSchedule(r,m)||{}; if(!sc.start||!sc.end){const start=add(range.start,Math.min(i*4,Math.max(0,range.days.length-8))); sc={start,end:add(start,4),generated:true};} return {r,i,no:i+1,sc};});
    return {s,pid,p,m,rows,range,days:range.days};
  }
  function txt(x,y,t,size=2,weight=700,anchor="middle",extra=""){return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" ${extra}>${esc(t)}</text>`;}
  function ln(x1,y1,x2,y2,w=.18,c="#000",dash=""){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"${dash?` stroke-dasharray="${dash}"`:""}/>`;}
  function rc(x,y,w,h,fill="#fff",stroke="#000",sw=.18,extra=""){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;}
  function segments(days,type){const key=d=>{const x=toDate(d); if(type==="year")return String(x.getUTCFullYear()); if(type==="month")return `${x.getUTCFullYear()}-${pad(x.getUTCMonth()+1)}`; if(type==="week"){const w=weekInfo(x); return `${w.year}-W${pad(w.week)}`;} return d;}; const lab=k=>{if(type==="year")return k; if(type==="month")return MONTHS[+k.split("-")[1]-1]||k; if(type==="week")return String(+(k.match(/W(\d+)$/)||[])[1]||""); return pad(toDate(k).getUTCDate());}; const out=[]; days.forEach(d=>{const k=key(d), last=out.at(-1); if(last&&last.key===k)last.n++; else out.push({key:k,n:1,label:lab(k)});}); return out;}
  function calendar(data,x,y,w,top){const order=top?["year","month","date","week"]:["week","date","month","year"], hs=top?[4.5,5,4.5,4.5]:[4.5,4.5,5,4.5]; let svg="", yy=y, dayW=w/Math.max(1,data.days.length); order.forEach((type,ri)=>{const h=hs[ri]; if(type==="date"){data.days.forEach((day,i)=>{const xx=x+i*dayW; svg+=rc(xx,yy,dayW,h,isNonWork(data.s,day)?"#d9d9d9":"#fff","#333",.08); svg+=txt(xx+dayW/2,yy+h/2,pad(toDate(day).getUTCDate()),1.15,800);});}else{let xx=x; segments(data.days,type).forEach(seg=>{const ww=seg.n*dayW; svg+=rc(xx,yy,ww,h,"#fff","#111",.13); svg+=txt(xx+ww/2,yy+h/2,seg.label,type==="week"?1.25:1.55,900); xx+=ww;});} yy+=h;}); return svg;}
  function header(data,W,M,H){const p=data.p, y=M, metaX=W-M-84; let svg=rc(M,y,W-2*M,H,"#fff","#000",.35)+rc(M,y,78,H,"#fff","#000",.25); const l=companyLogo(data.s); if(l)svg+=`<image href="${esc(l)}" x="${M+6}" y="${y+4}" width="64" height="14" preserveAspectRatio="xMidYMid meet"/>`; else{svg+=rc(M+6,y+4,64,14,"#ffd92f","none",0)+txt(M+38,y+10,"TASCHE",5.5,900)+txt(M+38,y+15,"STAALBOUW",2.4,800);} svg+=txt(W/2,y+8,projectName(p),3.2,900)+txt(W/2,y+13,`Opdrachtg.: ${clientName(p)||"—"}`,2.35,900)+txt(W/2,y+17,`Bouwplanning · bereik ${nl(data.range.start)} t/m ${nl(data.range.end)}`,1.55,700); [["Project nr.:",projectNo(p)],["Opdrachtg.:",clientName(p)||"—"],["Omschrijving:",p.omschrijving||p.description||projectName(p)],["Projectleider:",p.projectleider||p.projectLead||data.s?.user?.name||"—"],["Plotdatum:",new Date().toLocaleDateString("nl-NL")],["Revisienr.:",p.revision||"—"],["Revisiedatum:",p.revisionDate?nl(p.revisionDate):"—"]].forEach((r,i)=>{const rh=H/7; svg+=rc(metaX,y+i*rh,28,rh,"#fff","#000",.16)+rc(metaX+28,y+i*rh,56,rh,"#fff","#000",.16)+txt(metaX+1.3,y+i*rh+rh/2,r[0],1.2,900,"start")+txt(metaX+30,y+i*rh+rh/2,r[1],1.2,700,"start");}); return svg;}
  function fullSvg(data){
    const W=408,H=285,M=3.5,headH=22,legendH=14,boardY=M+headH,boardW=W-2*M,leftW=108,chartX=M+leftW,chartW=boardW-leftW,topCalH=18.5,bottomCalH=18.5,legendY=H-M-legendH,botCalY=legendY-bottomCalH,bodyY=boardY+topCalH,bodyH=botCalY-bodyY,displayN=Math.max(42,data.rows.length),rowH=bodyH/displayN,dayW=chartW/Math.max(1,data.days.length);
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="408mm" height="285mm" viewBox="0 0 408 285" shape-rendering="crispEdges">`;
    svg+=rc(M,M,W-2*M,H-2*M,"#fff","#000",.55)+header(data,W,M,headH)+rc(M,boardY,boardW,legendY-boardY,"#fff","#000",.35);
    svg+=rc(M,boardY,leftW,topCalH,"#fff","#000",.25)+rc(M,boardY,12,topCalH,"#fff","#000",.18)+rc(M+12,boardY,66,topCalH,"#fff","#000",.18)+rc(M+78,boardY,30,topCalH,"#fff","#000",.18)+txt(M+6,boardY+topCalH-2.2,"Regel",1.55,900)+txt(M+45,boardY+topCalH-2.2,"Naam",1.55,900)+txt(M+93,boardY+topCalH-2.2,"Bouwkundig",1.55,900)+calendar(data,chartX,boardY,chartW,true);
    for(let i=0;i<displayN;i++){const y=bodyY+i*rowH, row=data.rows[i], phase=row&&isPhase(row.r); svg+=rc(M,y,12,rowH,phase?"#63cfc9":i%2?"#eeeeee":"#fff","#000",.13)+rc(M+12,y,66,rowH,phase?"#63cfc9":i%2?"#eeeeee":"#fff","#000",.13)+rc(M+78,y,30,rowH,phase?"#63cfc9":i%2?"#eeeeee":"#fff","#000",.13); if(row){svg+=txt(M+6,y+rowH/2,row.no,1.5,900)+txt(M+14+clamp(indent(row.r)*2,0,8),y+rowH/2,row.r.name||row.r.title||row.r.id||"—",1.45,phase?900:700,"start")+txt(M+80,y+rowH/2,discipline(row.r,data.s),1.35,phase?900:700,"start");}}
    data.days.forEach((day,i)=>{const x=chartX+i*dayW; if(isNonWork(data.s,day))svg+=rc(x,bodyY,dayW,bodyH,"#d9d9d9","none",0);});
    for(let i=0;i<=displayN;i++)svg+=ln(chartX,bodyY+i*rowH,chartX+chartW,bodyY+i*rowH,.09,"#777");
    data.days.forEach((day,i)=>{const x=chartX+i*dayW, dd=toDate(day), isMonth=dd&&dd.getUTCDate()===1, isWeek=dd&&dd.getUTCDay()===1, width=isMonth?0.45:(isWeek?0.28:0.08); svg+=ln(x,bodyY,x,bodyY+bodyH,width,isMonth||isWeek?"#000":"#777",isMonth||isWeek?"":"1 1");});
    svg+=ln(chartX+chartW,bodyY,chartX+chartW,bodyY+bodyH,.35,"#000");
    data.rows.forEach(row=>{const sc=row.sc; if(!sc?.start||!sc?.end)return; const a=clamp(diff(data.range.start,sc.start),0,data.days.length-1), b=clamp(diff(data.range.start,sc.end),0,data.days.length-1), bx=chartX+a*dayW, bw=Math.max(dayW,(b-a+1)*dayW), y=bodyY+row.i*rowH; if(isPhase(row.r)){svg+=ln(bx,y+rowH*.52,bx+bw,y+rowH*.52,.9,"#000")+txt(bx+bw+1,y+rowH*.5,row.r.name||"Fase",1.45,900,"start");}else{const bh=Math.min(3.7,Math.max(2.4,rowH*.58)), by=y+(rowH-bh)/2; svg+=`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="0.5" fill="${barColor(row.r,row.i,data.s)}" stroke="#000" stroke-width="0.32"/>`; if(bw>7)svg+=txt(bx+.8,by+bh/2,`${row.no} ${row.r.name||"Taak"}`,1.25,900,"start");}});
    svg+=rc(M,botCalY,leftW,bottomCalH,"#fff","#000",.25)+txt(M+3,botCalY+6,"Regel",1.4,900,"start")+txt(M+13,botCalY+6,"Naam",1.4,900,"start")+txt(M+25,botCalY+6,"Bouwkundig",1.4,900,"start")+calendar(data,chartX,botCalY,chartW,false)+rc(M,legendY,boardW,legendH,"#fff","#000",.35)+txt(M+3,legendY+7,"Bouwkundig",1.65,900,"start");
    const lx=M+32,gap=31; LEGENDS.forEach((label,i)=>{const col=i%6,row=Math.floor(i/6), x=lx+col*gap, y=legendY+4+row*5; svg+=rc(x,y,10,2.4,LEGEND_COLORS[i],"#000",.18)+txt(x+12,y+1.2,label,1.25,700,"start");});
    return svg+`</svg>`;
  }
  function html(data){return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(projectName(data.p))} - BWS A3</title><style>@page{size:A3 landscape;margin:6mm;}html,body{margin:0;padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;}svg{display:block;width:408mm;height:285mm;}@media screen{body{background:#666;padding:8px}svg{background:#fff;box-shadow:0 8px 22px rgba(0,0,0,.35);}}</style></head><body data-bws-print-ready="${MARKER}">${fullSvg(data)}</body></html>`;}
  function openPrint(){const data=model(), h=html(data); window.__CWS_BWS_PRINT_LAST_HTML__=h; let frame=document.getElementById("cwsBwsA3PrintFrame"); if(!frame){frame=document.createElement("iframe"); frame.id="cwsBwsA3PrintFrame"; frame.title="BWS A3 afdruk"; frame.setAttribute("aria-hidden","true"); frame.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;"; document.body.appendChild(frame);} const w=frame.contentWindow, doc=frame.contentDocument||w?.document; if(!w||!doc)return false; doc.open(); doc.write(h); doc.close(); setTimeout(()=>{try{w.focus(); w.print();}catch(e){console.error(e);}},220); return true;}
  function isPrintButton(t){const e=t?.closest?.("#printBtn,[data-ctx-action='print'],[data-rev-action='print']"); return !!(e&&(e.id==="printBtn"||e.dataset?.ctxAction==="print"||e.dataset?.revAction==="print"));}
  function install(){if(document.__CWS_BWS_PRINT_A3_CLICK_BOUND__===MARKER)return; document.__CWS_BWS_PRINT_A3_CLICK_BOUND__=MARKER; document.addEventListener("click",e=>{if(!isPrintButton(e.target))return; e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); openPrint();},true); window.CWS_BWS_GanttPrintA3={marker:MARKER,open:openPrint,buildPrintModel:model,printDocumentHtml:html,usesPopup:false,fullPageSvg:true};}
  function inject(frame){try{const doc=frame?.contentDocument||frame?.contentWindow?.document; if(!doc?.head||doc.getElementById(SCRIPT_ID)||doc.documentElement?.dataset?.cwsBwsPrintA3Renderer===MARKER)return true; const script=doc.createElement("script"); script.id=SCRIPT_ID; script.src=SCRIPT_SRC; script.dataset.cwsBwsPrintA3Renderer=MARKER; doc.head.appendChild(script); return true;}catch(_){return false;}}
  function boot(){if(document.getElementById("printBtn"))return install(); const frame=document.getElementById("appFrame"); if(!frame)return; const go=()=>inject(frame); frame.addEventListener("load",()=>setTimeout(go,80)); setTimeout(go,80); let n=0,t=setInterval(()=>{if(go()||++n>45)clearInterval(t);},500);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();
})();