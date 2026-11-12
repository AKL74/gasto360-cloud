(function(root){
'use strict';
/* Gasto360 R8.18: reparación de OCR fiscal y documental mediante evidencias.
   Solo interpreta texto local; NO utiliza red, cuenta, Supabase ni historial de usuarios. */
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const close=(a,b)=>typeof a==='number'&&typeof b==='number'&&Math.abs(a-b)<.025;
const val=s=>{let t=String(s||'').trim().replace(/\s/g,'').replace(/€/g,'');
 if(/^\d{1,4}[.,]\d\d$/.test(t))return Number(t.replace(',','.'));
 return null;
};
const money=s=>[...String(s||'').matchAll(/(?<![\d])\d{1,4}[,.]\d{2}(?!\d)/g)].map(m=>val(m[0])).filter(Number.isFinite);
const linesOf=p=>String(p.text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const esc=s=>String(s||'').replace(/^\s*[|!I]\s*(?=[A-Za-zÁ-ÿ])/, '').trim();
function fiscalGroup(pass){
 const lines=linesOf(pass),groups=[];
 for(let i=0;i<lines.length;i++){
  if(!/^(?:IVA|LVA)\b.*BASE\s+IMPONIBLE.*CUOTA/.test(norm(lines[i])))continue;
  const rows=[];let summaryBase=null,summaryVat=null;
  for(let j=i+1;j<Math.min(i+10,lines.length);j++){
   const text=norm(lines[j]);if(/^TOTAL\b/.test(text)){
     const amounts=money(text);
     if(amounts.length>=2){summaryBase=amounts[0];summaryVat=amounts.at(-1);}
     break;
   }
   const rate=text.match(/^\s*(4|10|21)\s*%\s*(.*)$/);
   if(!rate)continue;
   const percentage=Number(rate[1]);
   const parts=rate[2].split(/\s+/).filter(Boolean);
   const baseToken=parts.find(x=>/^\d{1,4}[,.]\d{2}$/.test(x));
   if(!baseToken)continue;
   const base=val(baseToken);let vat=null,review=false;
   const idx=parts.indexOf(baseToken),right=parts.slice(idx+1);
   for(const token of right){
     if(/^\d{1,4}[,.]\d{2}$/.test(token)){vat=val(token);break;}
     if(/^\d{3}$/.test(token)){
       const candidate=Number(token)/100;
       if(close(round(base*percentage/100),candidate)){vat=candidate;review=true;break;}
     }
   }
   if(vat===null||!close(round(base*percentage/100),vat))continue;
   rows.push({rate:percentage,base,vat,gross:round(base+vat),raw:lines[j],source:pass.label,review});
  }
  if(!rows.length)continue;
  const unique=[...new Map(rows.map(r=>[r.rate,r])).values()];
  const base=round(unique.reduce((s,x)=>s+x.base,0)),tax=round(unique.reduce((s,x)=>s+x.vat,0));
  // Si la suma fiscal se puede contrastar con su fila TOTAL, se hace.
  // Si la fila TOTAL está dañada se requieren todas las filas, un pago corroborado
  // y no se inventa una cuota adicional.
  if(summaryBase!==null&&!close(base,summaryBase))continue;
  if(summaryVat!==null&&!close(tax,summaryVat))continue;
  groups.push({rows:unique,base,tax,gross:round(base+tax),
    summaryVerified:summaryBase!==null&&summaryVat!==null,
    source:pass.label});
 }
 return groups;
}
function findFiscal(passes,paid,prior){
 const candidates=(passes||[]).flatMap(p=>fiscalGroup(p));
 const matching=candidates.filter(x=>close(x.gross,paid));
 matching.sort((a,b)=>Number(b.summaryVerified)-Number(a.summaryVerified)||b.rows.length-a.rows.length);
 if(matching.length){
   const winner=matching[0],other=matching.some(x=>x!==winner&&x.rows.length===winner.rows.length&&close(x.base,winner.base)&&close(x.tax,winner.tax));
   if(winner.summaryVerified||other){
     return {rows:winner.rows,base:winner.base,tax:winner.tax,gross:winner.gross,
       status:'validado',inferredRows:0,warnings:[],source:winner.source,
       corroboration:winner.summaryVerified?'Resumen fiscal del ticket': 'Filas fiscales coincidentes entre lecturas'};
   }
 }
 return prior?.status==='validado'?prior:null;
}
// Validación de CIF para entidades españolas; la corrección de un dígito
// NO se propone salvo dos lecturas discrepantes en una sola posición.
function cifValid(s){
 if(!/^[A-HJ-NP-SUVW]\d{8}$/.test(s))return false;
 const a=s.slice(1,8).split('').map(Number);
 let sum=0;
 for(let i=0;i<7;i++){
   if(i%2===0){const n=a[i]*2;sum+=Math.floor(n/10)+(n%10);}
   else sum+=a[i];
 }
 return (10-sum%10)%10===Number(s[8]);
}
function findCif(passes,prior=''){
 const seen=[];
 for(const p of passes||[]){
  const head=linesOf(p).slice(0,12);
  for(const line of head){
   for(const m of line.toUpperCase().matchAll(/(?:^|[^\w])([A-HJ-NP-SUVW])\s*[- ]\s*((?:\d[\s-]*){8})(?!\d)/g)){
    const candidate=m[1]+m[2].replace(/[^\d]/g,'');
    if(candidate.length===9)seen.push({id:candidate,source:p.label});
   }
  }
 }
 const verified=seen.filter(x=>cifValid(x.id));
 if(verified.length)return {id:verified[0].id,confidence:'leido',source:verified[0].source};
 if(prior&&cifValid(prior))return {id:prior,confidence:'leido',source:'previo'};
 // Solo si DOS lecturas principales comparten exactamente 7 de los 8 dígitos.
 const main=seen.filter(x=>x.source==='original'||x.source==='contraste');
 for(let i=0;i<main.length;i++)for(let j=i+1;j<main.length;j++){
  const a=main[i],b=main[j];
  if(a.source===b.source||a.id[0]!==b.id[0]||a.id.at(-1)!==b.id.at(-1))continue;
  const changed=[...a.id].map((x,k)=>x===b.id[k]?-1:k).filter(k=>k>=0);
  if(changed.length!==1||changed[0]===0||changed[0]===8)continue;
  const options=[];
  for(let k=0;k<10;k++){
   const c=a.id.slice(0,changed[0])+k+a.id.slice(changed[0]+1);
   if(cifValid(c))options.push(c);
  }
  if(options.length===1)return {id:options[0],confidence:'deducido',source:a.source+' + '+b.source};
 }
 return null;
}
function findInvoice(passes){
 const hits=[];
 for(const p of passes||[]){
  for(const line of linesOf(p).slice(0,18)){
   if(!/FACTURA\s+S(?:I|L|N|P)/i.test(norm(line)))continue;
   const m=line.match(/\b(\d{3,5}\s*-\s*\d{2,4}\s*-\s*\d{5,7})\b/);
   if(m)hits.push({id:m[1].replace(/\s/g,''),source:p.label});
  }
 }
 const counts=new Map();hits.forEach(h=>counts.set(h.id,(counts.get(h.id)||0)+1));
 const best=[...counts].sort((a,b)=>b[1]-a[1])[0];
 return best?{id:best[0],n:best[1]}:null;
}
const stop=t=>/^(?:TOTAL\b|[I1]?DTAL\b|T[O0]TAL\b|IVA\b|LVA\b|TARJETA\b|TARJ[.]|ENTREGA\b|DEVOLUCION\b|CAMBIO\b|IMPORTE\b|BASE\s+IMPONIBLE\b)/.test(norm(t));
function productsInPass(pass){
 const lines=linesOf(pass);
 const start=lines.findIndex(x=>/DESCRIPCI[OÓ]N/.test(norm(x))&&/(?:P[., ]*UNIT|IMP[.()]|PRECIO)/.test(norm(x)));
 if(start<0)return [];
 const products=[];
 for(let i=start+1;i<lines.length;i++){
  const s=lines[i],u=norm(s);
  if(stop(s))break;
  // El OCR puede perder la O inicial en "TOTAL"; nunca es un artículo.
  if(/(?:DTAL|TOTAL)\s*\(?€?\)?/.test(u)&&!/\bPRODUCTO\b/.test(u))break;
  const weighted=s.match(/^\s*(\d+[.,]\d{3})\s+k[gy]\s+(\d+[.,]\d{2})\s*€?\s*\/\s*k[g9y]\s+(\d+[.,]\d{2})\s*$/i);
  if(weighted){
   const last=products.at(-1);if(!last||last.gross!==null)continue;
   const weight=Number(weighted[1].replace(',','.')),unitPrice=Number(weighted[2].replace(',','.'));
   const gross=val(weighted[3]);
   if(close(round(weight*unitPrice),gross)){Object.assign(last,{gross,net:gross,unit:'kg',quantity:1,weightKg:weight,unitPrice,needsReview:false});last.evidence.push({label:pass.label,raw:s});}
   continue;
  }
  if(!/^\s*[|!I1]\s+[A-ZÁÉÍÓÚÑ]/i.test(s))continue;
  const line=esc(s.replace(/^\s*[1I|!]\s*/,''));
  const m=line.match(/^(.*?)\s+(\d{1,4}[.,]\d{2})\s*$/);
  let name=m?m[1].trim():line.trim();
  name=name.replace(/[|!]+\s*$/,'').trim();
  if(name.length<3||stop(name)||!/[A-ZÁÉÍÓÚÑ]{3}/i.test(name))continue;
  const value=m?val(m[2]):null;
  products.push({name,gross:value,net:value,quantity:1,unit:'ud',unitPrice:null,weightKg:null,
    discount:0,vatRate:null,vatCode:null,evidence:[{label:pass.label,raw:s}],
    reviewReasons:value===null?['Subtotal no legible.']:[],candidates:value===null?[]:[{value,source:pass.label,raw:s,provisional:false}],
    needsReview:value===null,sourceLabel:pass.label,sourceLine:i});
 }
 return products;
}
function reconcileProducts(passes,paid){
 if(!Number.isFinite(paid)||paid<=0)return null;
 const sources=(passes||[]).filter(p=>['original','contraste'].includes(p.label));
 const candidates=sources.map(p=>({source:p.label,items:productsInPass(p)}))
 .filter(x=>x.items.length>=1&&x.items.every(item=>Number.isFinite(item.gross)));
 candidates.sort((a,b)=>b.items.length-a.items.length);
 const chosen=candidates.find(c=>close(round(c.items.reduce((s,i)=>s+i.gross,0)),paid));
 if(!chosen)return null;
 return chosen.items.map((it,i)=>({id:'producto-'+(i+1),...it}));
}
function apply(fields,analysis,passes){
 const paid=fields.amount!==null&&fields.amount!==''?Number(fields.amount):null;
 const fiscal=findFiscal(passes,paid,analysis?.fiscal);
 if(fiscal&&close(fiscal.gross,paid)){
   fields.tax=fiscal.tax;fields.base=fiscal.base;fields.fiscalValidated=true;
   fields.confidence={...(fields.confidence||{}),tax:94};
   analysis.fiscal=fiscal;
   if(analysis.essential){analysis.essential.fiscal=fiscal;analysis.essential.vatCorroborated=true;}
 }
 const cif=findCif(passes,fields.taxId);
 if(cif){fields.taxId=cif.id;
   if(cif.confidence==='deducido'){fields.flags=[...(fields.flags||[]),
     'NIF deducido mediante dígito de control y dos lecturas: confirma visualmente.'];}
 }else{
   // No publicar identificadores que no pasan el control de CIF.
   if(fields.taxId&&!cifValid(fields.taxId))fields.taxId='';
 }
 const invoice=findInvoice(passes);
 if(invoice)fields.invoiceNo=invoice.id;
 else if(/^(?:SIN?PLIFICADA|SIMPLIFICADA)$/i.test(fields.invoiceNo||''))fields.invoiceNo='';
 const improved=reconcileProducts(passes,paid);
 if(improved){
   analysis.items=improved;analysis.reconciliation=root.Gasto360DesgloseR816.summary(improved,paid);
   analysis.reconciliation.status='cuadrado';
   fields.items=improved;
 }
 analysis.version='R8.18';fields.desglose=analysis;
 return {fiscal,cif,invoice,products:improved?.length??0};
}
root.Gasto360RevisionR818={findFiscal,findCif,findInvoice,productsInPass,reconcileProducts,apply,cifValid};
if(typeof module!=='undefined'&&module.exports)module.exports=root.Gasto360RevisionR818;
})(typeof window!=='undefined'?window:globalThis);
