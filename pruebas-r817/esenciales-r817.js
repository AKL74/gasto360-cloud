(function(root){
'use strict';
/* R8.17: esenciales ANTES del desglose. Sin peticiones ni persistencia. */
const R=n=>Math.round((n+Number.EPSILON)*100)/100;
const dec=s=>{const n=Number(String(s).replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?R(n):null};
const fmt=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const eq=(a,b)=>a!==null&&b!==null&&Math.abs(a-b)<.025;
const price=s=>{const x=String(s||'').match(/(?:^|[^\d])(\d{1,5}[.,]\d{2})(?!\d)/g);return (x||[]).map(y=>dec(y.match(/\d+[.,]\d{2}/)?.[0]||'')).filter(Number.isFinite)};
const weighted=(list,fn)=>{const sums=new Map();for(const x of list){const k=String(fn(x));sums.set(k,(sums.get(k)||0)+(x.weight||1));}return [...sums].sort((a,b)=>b[1]-a[1])[0]?.[0]||null};
function interpret(passes,fields){
 const main=passes.filter(p=>p.label==='original'||p.label==='contraste');
 const all=passes||[],events=[],rates=[],observations=[];
 const add=(kind,value,pass,raw,quality=0)=>events.push({kind,value,source:pass.label,raw:raw.trim(),quality});
 for(const p of all){
  const lines=String(p.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  for(let i=0;i<lines.length;i++){
   const t=fmt(lines[i]),line=lines[i],nums=price(line);
   const day=line.match(/(?:^|\s)([0-3]\d\/[01]\d\/20\d\d)(?=\s|$)/);
   if(day&&p.label!=='pie')add('date',day[1],p,line,p.label==='original'||p.label==='contraste'?3:1);
   if(/^\s*IMPORTE\s*:/i.test(t)&&nums.length)add('bankAmount',nums.at(-1),p,line,5);
   else if(/^\s*(?:TARJETA\s+BANCAR|TARJ[.]?\s*BANCAR)/.test(t)&&nums.length)add('tender',nums.at(-1),p,line,2);
   else if(/^\s*TOTAL\b/.test(t)&&nums.length===1)add('total',nums[0],p,line,2);
   if(/^ENTREGA\s+EFECTI/.test(t)&&nums.length)add('cashTender',nums.at(-1),p,line,2);
   if(/^(?:DEVOLUCION|CAMBIO)\b/.test(t)&&nums.length)add('change',nums.at(-1),p,line,2);
   if(/^IVA.*BASE\s+IMPONIBLE/.test(t)&&/(?:CUOTA)/.test(t)){
     const taxRows=[];let totalBase=null,totalTax=null;
     for(let j=i+1;j<Math.min(lines.length,i+9);j++){
       const l=fmt(lines[j]),m=l.match(/^\s*(4|10|21)\s*%\s+(\d{1,4}[.,]\d{2})\s+(\d{1,4}[.,]\d{2})/);
       if(m){
         const rate=Number(m[1]),base=dec(m[2]),tax=dec(m[3]);
         if(eq(R(base*rate/100),tax))taxRows.push({rate,base,vat:tax,gross:R(base+tax),source:p.label,raw:lines[j],review:false});
         continue;
       }
       if(/^TOTAL\b/.test(l)){
         const totalValues=price(l);if(totalValues.length===2){totalBase=totalValues[0];totalTax=totalValues[1];}
         break;
       }
     }
     // Si el OCR deteriora la fila 21 %, reconstruir la cuota únicamente
     // cuando aparecen por separado tipo y resumen fiscal BASE + CUOTA.
     if(!taxRows.length&&totalBase!==null&&totalTax!==null){
       const rawRate=lines.slice(i+1,Math.min(lines.length,i+7))
         .map(x=>fmt(x).match(/^\s*(4|10|21)\s*%/)).filter(Boolean).map(x=>Number(x[1]));
       if(rawRate.length===1&&eq(R(totalBase*rawRate[0]/100),totalTax))
         taxRows.push({rate:rawRate[0],base:totalBase,vat:totalTax,
           gross:R(totalBase+totalTax),source:p.label,raw:'Resumen fiscal + tipo '+rawRate[0]+'%',review:true});
     }
     const base=R(taxRows.reduce((s,x)=>s+x.base,0)),tax=R(taxRows.reduce((s,x)=>s+x.vat,0));
     if(taxRows.length&&totalBase!==null&&totalTax!==null&&eq(base,totalBase)&&eq(tax,totalTax))
       rates.push({rows:taxRows,base,tax,gross:R(base+tax),source:p.label,
         quality:taxRows.length*2+(p.label==='original'?1:0)});
   }
   // artículos unitarios solo para respaldo adicional, nunca reemplazan al pago.
   if(/^DESCRIPCION\b/.test(t)){
    for(let j=i+1;j<lines.length;j++){
      const l=fmt(lines[j]);
      if(/^(?:TOTAL|IVA|ENTREGA|TARJETA|DEVOLUCION)\b/.test(l))break;
      const amounts=price(lines[j]);
      if(amounts.length===1&&/[A-Z]{4}/.test(l)&&!/\bKG\b/.test(l))
        observations.push({kind:'itemPrice',value:amounts[0],source:p.label,raw:lines[j]});
    }
   }
  }
 }
 // Validación fiscal de 1 único tipo (21%) o varios tipos (4%,10%).
 rates.sort((a,b)=>b.quality-a.quality);
 const fiscal=rates[0]||null;
 const fiscalAgreement=fiscal&&rates.some(x=>x!==fiscal&&eq(x.base,fiscal.base)&&eq(x.tax,fiscal.tax));
 const amountGroups=[];
 for(const e of events.filter(x=>typeof x.value==='number'&&x.value>0)){
   if(['bankAmount','total','tender'].includes(e.kind))amountGroups.push(e);
 }
 const matchesByAmount=val=>amountGroups.filter(x=>eq(x.value,val));
 const candidateValues=[...new Set([...amountGroups.map(x=>x.value),...(fiscal?[fiscal.gross]:[]),...observations.map(x=>x.value)])];
 let accepted=null,reason='',confidence=0;
 // Fiscales válidos, un "Importe:" explícito y sin datos contradictores en el propio comprobante.
 if(fiscal){
  const bank=events.filter(x=>x.kind==='bankAmount'&&eq(x.value,fiscal.gross));
  const totals=events.filter(x=>x.kind==='total'&&eq(x.value,fiscal.gross));
  const matchingProducts=observations.filter(x=>eq(x.value,fiscal.gross));
  if(bank.length>=1){accepted=fiscal.gross;reason='Importe de pago explícito y tabla IVA';confidence=96;}
  else if(totals.length>=1){accepted=fiscal.gross;reason='TOTAL y tabla IVA';confidence=94;}
  else if(matchingProducts.length>=1&&fiscalAgreement){accepted=fiscal.gross;reason='Producto e IVA confirmados en dos lecturas';confidence=93;}
  else if(matchingProducts.length>=1&&events.some(x=>x.kind==='cashTender'&&x.value>=fiscal.gross)){
    accepted=fiscal.gross;reason='Producto, IVA y entrega de efectivo';confidence=90;
  }
 }
 // Si los pagos son explícitos sin fiscalidad, se admite según múltiples lecturas independientes.
 if(accepted===null){
  const bank=events.filter(x=>x.kind==='bankAmount');
  const winner=weighted(bank,x=>x.value);
  const corroborated=bank.filter(x=>Number(winner)===x.value);
  if(corroborated.length>=2 && new Set(corroborated.map(x=>x.source)).size>=2){
    accepted=Number(winner);reason='Importe explícito repetido en dos lecturas';confidence=87;
  }
 }
 const paymentEvents=events.filter(x=>['bankAmount','tender','cashTender','change'].includes(x.kind));
 const bankEvidence=paymentEvents.filter(x=>['bankAmount','tender'].includes(x.kind));
 const cashEvidence=paymentEvents.filter(x=>['cashTender','change'].includes(x.kind));
 let payment=null,paymentConf=0;
 if(bankEvidence.length&&!cashEvidence.length){payment='Tarjeta';paymentConf=91;}
 else if(cashEvidence.length&&!bankEvidence.length){payment='Efectivo';paymentConf=91;}
 else if(bankEvidence.length&&cashEvidence.length){
  payment=null;paymentConf=0; // mixed payment: require review, never assume.
 }
 const dates=events.filter(x=>x.kind==='date');
 const preferred=dates.filter(x=>x.source==='original'||x.source==='contraste');
 const dateTxt=weighted(preferred.length?preferred:dates,x=>x.value);
 const countDate=preferred.filter(x=>x.value===dateTxt).length;
 let date=null;
 if(dateTxt&&countDate>=2){const [d,m,y]=dateTxt.split('/');date=y+'-'+m+'-'+d;}
 const status=fiscal?'validado':'pendiente';
 const fiscalResult=fiscal?{rows:fiscal.rows,base:fiscal.base,tax:fiscal.tax,gross:fiscal.gross,status,
   inferredRows:0,warnings:[]}:{rows:[],base:null,tax:null,gross:null,status:'pendiente',inferredRows:0,
   warnings:['No hay tabla fiscal suficiente para validar base e IVA.']};
 return {version:'R8.17',amount:accepted,amountConfidence:confidence,amountReason:reason,originalAmount:fields.amount,
   date, dateConfidence:date?93:0,payment,paymentConfidence:paymentConf,fiscal:fiscalResult,
   evidence:events,vatCorroborated:!!fiscalAgreement,
   warnings:accepted===null?['TOTAL sin corroboración suficiente: requiere confirmación.']:[],
   amountCandidates:candidateValues.filter(x=>x>0&&Number.isFinite(x)).slice(0,12)};
}
function apply(fields,analysis,essential){
 const f=fields,a=analysis,e=essential;
 f.confidence={...(f.confidence||{})};f.flags=[...(f.flags||[])];
 if(e.date){f.date=e.date;f.confidence.date=e.dateConfidence;
    f.flags=f.flags.filter(x=>!x.includes('Las lecturas no coinciden en la fecha'));}
 if(e.payment){f.payment=e.payment;}
 else if(!e.payment&&e.evidence.some(x=>x.kind==='bankAmount'||x.kind==='cashTender')){f.payment='Otro';f.flags.push('Forma de pago mixta o contradictoria. Comprueba.');}
 if(e.amount!==null){
   const old=f.amount;f.amount=e.amount;f.confidence.amount=e.amountConfidence;
   f.amountCandidates=[e.amount,...e.amountCandidates.filter(x=>!eq(x,e.amount))];
   f.flags=f.flags.filter(x=>!x.includes('Hay varios importes reconocidos'));
   if(!eq(Number(old),e.amount))f.flags.push('Total corregido desde '+Number(old).toFixed(2)+' € a '+e.amount.toFixed(2)+' €: '+e.amountReason+'.');
   f.totalSource=e.amountReason;
 }else{
   f.amount=null;f.confidence.amount=0;f.flags.push('No ha sido posible verificar el TOTAL: revisa antes de guardar.');
   f.amountCandidates=e.amountCandidates;
 }
 if(e.fiscal.status==='validado'&&e.amount!==null&&eq(e.amount,e.fiscal.gross)){
   f.tax=e.fiscal.tax;f.base=e.fiscal.base;f.fiscalValidated=true;f.confidence.tax=94;
 }else{f.tax=null;f.base=null;f.fiscalValidated=false;f.confidence.tax=0;}
 if(a){
  a.fiscal={...e.fiscal,status:f.fiscalValidated?'validado':'pendiente'};
  a.essential=e;
  a.reconciliation=root.Gasto360DesgloseR816.summary(a.items||[],Number(f.amount||0));
  if((a.items||[]).some(x=>x.needsReview&&!x.confirmedByUser))a.reconciliation.status='pendiente';
  // Productos dudosos jamás bloquean el IVA o el total esenciales.
  if(a.items?.length===1&&a.items[0].gross===null&&e.amount!==null &&
      e.fiscal.status==='validado'&&
      e.evidence.some(x=>x.kind==='cashTender')){
    // NO atribuir pesos ficticios; permitir revisar el producto sin contaminar los campos clave.
    a.items[0].unit='ud';a.items[0].weightKg=null;
  }
 }
 return f;
}
root.Gasto360EsencialesR817={interpret,apply};
if(typeof module!=='undefined'&&module.exports)module.exports=root.Gasto360EsencialesR817;
})(typeof window!=='undefined'?window:globalThis);