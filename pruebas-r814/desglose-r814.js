(function(root){
'use strict';
/* Gasto360 R8.14 — desglose local trazable. No modifica OCR ni conecta con la nube. */
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const clean=s=>String(s||'').replace(/[\u2500-\u257f]/g,' ').replace(/\s+/g,' ').trim();
const money=/\d{1,5}(?:\.\d{3})*,\d{2}|\d{1,5}\.\d{2}/g;
function vals(s){
 return Array.from(String(s||'').matchAll(new RegExp(money.source,'g'))).map(x=>({
  raw:x[0],start:x.index,end:x.index+x[0].length,
  value:round(Number(x[0].includes(',')?x[0].replace(/\./g,'').replace(',','.'):x[0]))
 })).filter(x=>Number.isFinite(x.value)&&x.value>=0&&x.value<100000);
}
const rate=code=>({A:4,B:10,C:21})[code]||null;
function canonical(name){
 return norm(name).replace(/[^A-Z0-9 ]/g,'').replace(/\b(DE|DEL|LA|EL|CON|Y|DO|C|P)\b/g,'').replace(/\s+/g,' ').trim();
}
function similarity(a,b){
 const A=new Set(canonical(a).split(' ').filter(x=>x.length>2)),B=new Set(canonical(b).split(' ').filter(x=>x.length>2));
 let common=0;for(const w of A)if(B.has(w))common++;
 return common/Math.max(1,Math.max(A.size,B.size));
}
const SKIP=/^(?:LIDL|MERCADONA|ALCAMPO|CARREFOUR|GRUPO DIA|SUPERMERCADOS|NIF\b|CIF\b|IVA\b|PVP\b|EUR\b|TOTAL\b|ENTREGA\b|RECIBO\b|VENTA\b|PAGO\b|CAMBIO\b|DEVOLUC|FACTURA\b|TICKET\b|GRACIAS\b|HORA\b|FECHA\b|CLIENTE\b|SUMA\b|DIRECCION\b|AVDA\b|WWW\b|HTTP\b|CUOTA\b|BASE\b|DESCUENTO\b|AHORRO\b|TOTAL OFERTA\b|DESC\.\s*TOTAL\b|IMP\.\s*:|\d{4,}\b)/;
const STOP=/^(?:TOTAL\b|T0TAL\b|LO[T7]AL\b|ENTREGA\b|RECIBO\b|VENTA CONTADO\b|IMP\.\s*:|IVA%|SUMA\b|TOTAL OFERTA\b)/;
function parseProducts(text,label='original'){
 const lines=String(text||'').split(/\r?\n/).map(clean),items=[],orphans=[],warnings=[];
 let active=false,seenHeader=false,last=null;
 for(let i=0;i<Math.min(lines.length,140);i++){
  const line=lines[i],u=norm(line);if(!line)continue;
  if(STOP.test(u)&&items.length)break;
  if(/NIF\b|DESCRIPCION|ARTICULOS|PRODUCTOS|SUPERMERCADOS/.test(u))seenHeader=true;
  if(/^(?:PROMO|PROMOCION|DESCUENTO|DTO\b|AHORRO|CUPON)\b/.test(u)){
   const p=vals(line),v=p.length?p[p.length-1].value:null;
   if(last&&v>0&&i-last.sourceLine<=2){
    last.discount=round(last.discount+v);
    last.discountEvidence.push({label,raw:line,amount:v,signInferred:!/-\s*\d/.test(line)});
    if(!/-\s*\d/.test(line))last.reviewReasons.push('Signo de promoción inferido por la etiqueta: confirmar.');
   }else{orphans.push({line,amount:v,label});warnings.push('Descuento sin artículo: '+line)}
   continue;
  }
  const weight=line.match(/^\s*(\d[,.]\d{3})\s*kg\s*[x×*]\s*(\d+[,.]\d{2})/i);
  if(weight){
   if(last){
    const kg=Number(weight[1].replace(',','.')),price=Number(weight[2].replace(',','.'));
    last.weightKg=kg;last.unitPrice=price;last.unit='kg';
    if(last.gross!==null&&Math.abs(round(kg*price)-last.gross)>.025)
      last.reviewReasons.push('Peso × precio/kg no coincide con importe.');
   }else warnings.push('Peso sin artículo: '+line);
   continue;
  }
  if(/\/KG|EUR\/KG/i.test(u))continue;
  if(SKIP.test(u)||/\b(?:11407|900958)\b/.test(u)||/^\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d/.test(u))continue;
  if(/^(?:A\s*4[%H]|B\s*10%|C\s*21%|IVA%)/.test(u))break;
  const prices=vals(line),tail=prices.length?prices[prices.length-1]:null;
  let gross=null,name=line,vatCode=null;
  if(tail){
    const suffix=line.slice(tail.end).trim();
    if(!/^(?:[ABC]|EUR|€|[ABC]\s*€|€\s*[ABC])?$/i.test(suffix))continue;
    gross=tail.value;name=line.slice(0,tail.start).trim();
    const m=suffix.match(/\b([ABC])\b/i);if(m)vatCode=m[1].toUpperCase();
  }
  if(!/[A-ZÁÉÍÓÚÜÑ]{3}/i.test(name)||/^\s*[\d.,\s%-]+$/.test(name))continue;
  if(/(?:IVA|BASE IMPONIBLE|TARJETA BANCARIA|NUM OPERACION|ATENCION|DEVOLUCIONES|PROMO|LIDL PLUS)/.test(norm(name)))continue;
  if(!seenHeader&&items.length===0&&!tail)continue;
  const qm=name.match(/(\d+[,.]\d{2})\s*[x×*]\s*(\d{1,2})\b/i);
  let quantity=1,unitPrice=null,quantityInferred=false,notes=[];
  if(qm){
    unitPrice=Number(qm[1].replace(',','.'));quantity=Number(qm[2]);
    name=name.slice(0,qm.index).trim();
    if(gross!==null&&Math.abs(round(quantity*unitPrice)-gross)>.025){
      const inferred=Math.round(gross/unitPrice);
      if(inferred>=1&&inferred<=50&&Math.abs(round(inferred*unitPrice)-gross)<.025){
        quantity=inferred;quantityInferred=true;notes.push('Cantidad deducida del importe: comprobar.')
      }else{quantity=null;notes.push('Cantidad OCR contradictoria.')}
    }
  }
  if(name.length<4||!/[A-ZÁÉÍÓÚÜÑ]/i.test(name))continue;
  if(gross===null&&!active)continue;
  if(gross===null&&!/^[A-ZÁÉÍÓÚÜÑ ]{4,}/i.test(name))continue;
  if(gross!==null&&gross<=0)continue;
  active=true;
  const item={id:'line-'+items.length,name:clean(name),gross,discount:0,net:gross,
   quantity,unit:'ud',unitPrice,quantityInferred,weightKg:null,vatCode,vatRate:rate(vatCode),
   evidence:[{label,raw:line}],discountEvidence:[],reviewReasons:notes,sourceLine:i,sourceLabel:label};
  if(gross===null)item.reviewReasons.push('Importe OCR no legible.');
  items.push(item);last=item;
 }
 items.forEach(g=>{g.net=g.gross===null?null:round(g.gross-g.discount)});
 return {items,orphans,warnings,label};
}
function mergeProducts(passes){
 const score=x=>x.items.length*8+x.items.filter(p=>p.gross!==null).length*3+
    x.items.filter(p=>p.discountEvidence.length).length*5+x.items.filter(p=>p.weightKg!==null).length*2;
 const sorted=passes.slice().sort((a,b)=>score(b)-score(a));
 if(!sorted.length)return [];
 const output=sorted[0].items.map(x=>JSON.parse(JSON.stringify(x)));
 for(const pass of sorted.slice(1)){
  const used=new Set();
  output.forEach((dst,i)=>{
   let best=null,bestScore=-1;
   pass.items.forEach((src,j)=>{
    if(used.has(j))return;
    const sim=similarity(dst.name,src.name),pos=Math.abs(i-j)<=1?.13:0;
    if((sim>=.48||sim>=.28&&Math.abs(i-j)<=1)&&sim+pos>bestScore){bestScore=sim+pos;best=j}
   });
   if(best===null)return;used.add(best);
   const src=pass.items[best];
   if(dst.gross===null&&src.gross!==null){dst.gross=src.gross;dst.sourceLabel=src.sourceLabel;dst.reviewReasons=dst.reviewReasons.filter(x=>!x.includes('Importe OCR'))}
   if(dst.quantityInferred&&!src.quantityInferred&&src.quantity!==null){dst.quantity=src.quantity;dst.quantityInferred=false;dst.reviewReasons=dst.reviewReasons.filter(x=>!x.includes('Cantidad deducida'))}
   if(dst.quantity===1&&src.quantity>1){dst.quantity=src.quantity;dst.unitPrice=src.unitPrice}
   if(dst.weightKg===null&&src.weightKg!==null){dst.weightKg=src.weightKg;dst.unit='kg';dst.unitPrice=src.unitPrice}
   if(!dst.vatCode&&src.vatCode){dst.vatCode=src.vatCode;dst.vatRate=src.vatRate}
   if(dst.discount===0&&src.discount>0){dst.discount=src.discount;dst.discountEvidence=src.discountEvidence}
   dst.evidence.push(...src.evidence);
  });
 }
 output.forEach((x,i)=>{x.id='producto-'+(i+1);x.net=x.gross===null?null:round(x.gross-x.discount);x.needsReview=!!x.reviewReasons.length||x.gross===null});
 return output;
}
function parseVat(text,label){
 const lines=String(text||'').split(/\r?\n/).map(clean),pos=lines.findIndex(l=>/IVA%/.test(norm(l))||/\bIVA\s*\+\s*PN\b/.test(norm(l)));
 if(pos<0)return [];
 const rows=[];
 for(let i=pos+1;i<Math.min(lines.length,pos+17);i++){
  const u=norm(lines[i]);if(/^SUMA\b/.test(u))break;
  const m=u.match(/^([ABC])\s*(4[%H]|10%|21%)(?:\s|$)/);
  if(!m)continue;
  const code=m[1],targetRate=rate(code),v=vals(lines[i]);
  if(v.length<2)continue;
  const vat=v[0].value,base=v.length>=3?v[1].value:null,gross=v[v.length-1].value;
  const actualBase=base===null?round(gross-vat):base,derived=base===null;
  const valid=gross>vat&&actualBase>0&&Math.abs(round(vat+actualBase)-gross)<=.025&&
    Math.abs((vat/actualBase)*100-targetRate)<.65;
  if(valid)rows.push({code,rate:targetRate,vat,base:actualBase,gross,baseDerived:derived,
    source:label,raw:lines[i],review:derived||/4H/.test(u)});
 }
 return rows;
}
function fiscalFromPasses(passes,paid){
 const grouped={},scores={};
 for(const p of passes){
  const rows=parseVat(p.text||'',p.label||'OCR');
  for(const row of rows){
   const score=(row.baseDerived?0:10)+rows.length*3+(p.confidence||0)*.01;
   if(!grouped[row.code]||score>scores[row.code]){grouped[row.code]=row;scores[row.code]=score}
  }
 }
 const rows=Object.values(grouped).sort((a,b)=>a.rate-b.rate);
 const tax=round(rows.reduce((n,x)=>n+x.vat,0)),base=round(rows.reduce((n,x)=>n+x.base,0)),gross=round(rows.reduce((n,x)=>n+x.gross,0));
 const validated=rows.length===3&&paid>0&&Math.abs(gross-paid)<.035&&Math.abs(round(base+tax)-paid)<.035;
 return {rows,base:validated?base:null,tax:validated?tax:null,gross:validated?gross:null,
  status:validated?'validado':'pendiente',inferredRows:rows.filter(x=>x.baseDerived).length,
  warnings:validated?rows.some(r=>r.review)?['Una fila fiscal contiene una lectura o base calculada: compruébala.']:[]:
  ['El IVA no se ha validado; no se registrará automáticamente.']};
}
function summary(items,total){
 const known=items.filter(x=>x.gross!==null),gross=round(known.reduce((n,x)=>n+x.gross,0));
 const discounts=round(items.reduce((n,x)=>n+x.discount,0)),net=round(gross-discounts);
 const unknown=items.filter(x=>x.gross===null);
 const diff=total>0?round(total-net):null;
 const status=unknown.length===0&&diff!==null&&Math.abs(diff)<=.02?'cuadrado':'pendiente';
 let suggestion=null;
 if(unknown.length===1&&diff!==null&&diff>0&&diff<1000)
  suggestion={itemId:unknown[0].id,amount:diff,note:'Diferencia calculada; NO es un precio leído. Debes confirmarlo.'};
 return {total:total>0?total:null,grossKnown:gross,discounts,netKnown:net,
  difference:diff,unknown:unknown.length,known:known.length,status,suggestion};
}
function analyze(passes,fields){
 const usable=(passes||[]).filter(p=>p?.text&&p.text.trim().length>20&&!/^(?:cabecera|pie)(?: suave)?$/.test(p.label||''));
 const main=usable.filter(p=>p.label==='original'||p.label==='contraste'),sources=main.length?main:usable;
 const groups=sources.map(p=>parseProducts(p.text,p.label));
 const items=mergeProducts(groups),paid=Number(fields?.amount||0);
 const fiscal=fiscalFromPasses(passes||[],paid),reconciliation=summary(items,paid);
 return {version:'R8.14',items,reconciliation,fiscal,warnings:[...new Set(groups.flatMap(x=>x.warnings))],
  sourcePasses:sources.map(p=>({label:p.label,characters:p.text.length,confidence:p.confidence||0})),provisional:true};
}
function normalizeEditable(item){
 const name=clean(item.name),gross=item.gross===''||item.gross===null?null:Number(item.gross),
 discount=Number(item.discount||0),quantity=item.quantity===''?null:Number(item.quantity||1);
 if(!name||name.length>140||!Number.isFinite(discount)||discount<0)throw Error('Nombre o descuento inválido.');
 if(gross!==null&&(!Number.isFinite(gross)||gross<0||discount>gross))throw Error('Importe o descuento inválido.');
 if(quantity!==null&&(!Number.isFinite(quantity)||quantity<=0||quantity>10000))throw Error('Cantidad inválida.');
 return {...item,name,gross:gross===null?null:round(gross),discount:round(discount),quantity,
  net:gross===null?null:round(gross-discount),manualReview:true,needsReview:gross===null};
}
const api={analyze,parseProducts,parseVat,fiscalFromPasses,summary,normalizeEditable,canonical,round};
root.Gasto360DesgloseR814=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);