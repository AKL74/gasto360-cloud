(function(root){
'use strict';
/* R8.15: rescate conservador de productos y tabla fiscal del mismo OCR.
   Reutiliza el escáner R8.14. Ninguna propuesta se considera un precio leído. */
const base=root.Gasto360DesgloseR814;
if(!base)throw Error('Falta el desglose R8.14');
const N=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const C=s=>String(s||'').replace(/\s+/g,' ').trim(),R=base.round;
const rate=c=>({A:4,B:10,C:21})[c]||null;
const money=/\d{1,4}[,.]\d{2}(?!\d)/g;
function values(s){
 const out=[];for(const m of String(s||'').matchAll(new RegExp(money.source,'g'))){
  const amount=Number(m[0].replace(',','.'));
  if(Number.isFinite(amount)&&amount>=0&&amount<=10000)out.push({amount:R(amount),start:m.index,end:m.index+m[0].length});
 }return out;
}
const HEAD_IGNORE=/^(?:EUR\b|NIF\b|CIF\b|IVA\b|TVA\b|SUMA\b|TOTAL\b|ENTREGA\b|IMP\.|RECIBO\b|VENTA\b|CAJA\b|CLIENTE\b|DESCUENTO\b|FACTURA\b|GRACIAS\b|TICKET\b|FECHA\b|HORA\b|WWW|HTTP|BASE\b|DESCRIPCI|ART[IÍ]CULOS\b|AVDA\b|CALLE\b|LIDL SUPERMERCADOS\b)/;
function parseFull(pass){
 const lines=String(pass?.text||'').split(/\r?\n/).map(C);
 let start=lines.findIndex(s=>/^\s*(?:\\\s*)?EUR\s*$|^\s*(?:DESCRIPCION|DESCRIPCIÓN|ARTICULOS|ARTÍCULOS)\b/i.test(s));
 if(start<0)start=lines.findIndex(s=>/\bNIF\b|\bCIF\b|\bSUPERMERCADOS\b/i.test(s));
 start=Math.max(0,start+1);
 let end=lines.findIndex((s,i)=>i>start&&/^\s*(?:TOTAL\s+\d|TOTAL\s*$|ENTREGA\b|VENTA CONTADO\b|IMP\.\s*:)/i.test(s));
 if(end<0)end=Math.min(lines.length,start+70);
 const items=[],promos=[];
 for(let i=start;i<end;i++){
  const line=lines[i],upper=N(line);if(!line)continue;
  if(/^\s*(PROMO|PROMOCION|AHORRO|DTO\b|CUPON)\b/.test(upper)){
   const v=values(line).at(-1);
   promos.push({at:items.length-1,value:v?.amount??null,raw:line});
   continue;
  }
  const kg=line.match(/^\s*(\d[,.]\d{3})\s*kg\s*[x×*]\s*(\d+[,.]\d{2})/i);
  if(kg){
   const last=items.at(-1);
   if(last){last.weightKg=Number(kg[1].replace(',','.'));last.unitPrice=Number(kg[2].replace(',','.'));}
   continue;
  }
  if(HEAD_IGNORE.test(upper)||/^[0-9.,\s%ABCx×*€/]+$/.test(upper)||!/[A-Z]{3}/i.test(upper))continue;
  if(/\bPROMO\b|LIDL PLUS|DEVOLUCIONES|ATENCION|\/KG\b/.test(upper))continue;
  if(/^(?:JEREZ|11407|LIDL|MERCADONA)\b/.test(upper))continue;
  const all=values(line),tail=all.at(-1);
  let price=null,reason=[],name=line,unitPrice=null,quantity=1,vat=null;
  const quantityMatch=line.match(/(\d{1,4}[,.]\d{2})\s*[x×*%]\s*(\d{1,2})\b/i);
  const separated=line.match(/(\d{1,4}[,.]\d{2})\s+(\d{1,2})\b/i);
  const q=quantityMatch||separated;
  if(q){unitPrice=Number(q[1].replace(',','.'));quantity=Number(q[2]);}
  if(tail&&tail.start>=3){
   const suffix=line.slice(tail.end).trim();
   const accepted=/^(?:[ABC]|€|EUR|[ABC]\s*€|[:.;|])?$/i.test(suffix);
   const weak=/^[0-9]\s*[ABC]?$/.test(suffix);
   if(accepted||weak){
    price=tail.amount;
    if(weak)reason.push('Precio OCR con caracteres finales dudosos.');
    if(q&&all.length===1){price=null;reason.push('Se leyó precio unitario, no importe total.')}
    if(price!==null&&q&&Math.abs(R(quantity*unitPrice)-price)>.025){
     price=null;reason.push('Cantidad y total contradictorios.');
    }
    vat=(suffix.match(/\b([ABC])\b/i)||[])[1]||null;
   }
   if(all.length&&all[0].start>3)name=line.slice(0,all[0].start).trim();
  name=name.replace(/\s+\d{2,3}\s*[ABC]\s*$/i,'').trim();
  }
  if(name.length<4)continue;
  items.push({name,raw:line,label:pass.label,line:i,price,quantity,unitPrice,vat,weightKg:null,reason});
 }
 return {items,promos,label:pass?.label||'OCR'};
}
function similarity(a,b){
 const aa=new Set(base.canonical(a).split(' ').filter(x=>x.length>=3));
 const bb=new Set(base.canonical(b).split(' ').filter(x=>x.length>=3));let n=0;
 for(const t of aa)if(bb.has(t))n++;
 return n/Math.max(1,Math.max(aa.size,bb.size));
}
function merge(a,b){
 const used=new Set();
 return a.map((x,i)=>{
  let best=-1,score=0;
  for(let j=0;j<b.length;j++){
   if(used.has(j))continue;
   const sim=similarity(x.name,b[j].name),near=Math.max(0,.28-Math.abs(i-j)*.09);
   if((sim>.31||sim>.14&&Math.abs(i-j)<=1||a.length===b.length&&i===j&&sim>.07)&&sim+near>score){score=sim+near;best=j}
  }
  if(best<0)return {main:x,other:null};
  used.add(best);return {main:x,other:b[best]};
 });
}
function headerData(text){
 const all=String(text||'').split(/\r?\n/).map(C).filter(Boolean),lines=[];
 for(let i=0;i<all.length;i++){
  if(/^\d{1,3},\s*$/.test(all[i])&&/^\d{2}\s*[ABC]\s*$/.test(all[i+1]||'')){
   lines.push(all[i].replace(/\s/g,'')+all[++i]);continue;
  }lines.push(all[i]);
 }
 const start=lines.findIndex(x=>/\bNIF\b|\bCIF\b/.test(N(x)));
 const entries=lines.slice(Math.max(0,start+1),Math.max(start+1,Math.min(lines.length,start+90))).map((line,i)=>({
  line,i,m:values(line),vat:(line.match(/\b([ABC])\s*$/)||[])[1]||null
 }));
 const offers=[];
 for(let i=0;i<entries.length;i++){
  if(!/^(?:PROMO|PROMOCION|DTO\b)/i.test(entries[i].line))continue;
  const choices=[];
  for(let j=Math.max(0,i-3);j<Math.min(entries.length,i+4);j++){
   if(j===i)continue;
   const e=entries[j],v=e.m.at(-1);if(!v||v.amount<=0||e.vat||/\/KG/i.test(e.line))continue;
   const dist=j-i,score=(dist<0?2:1.3)-Math.abs(dist)*.18+(/^\s*-/.test(e.line)?2:0);
   choices.push({value:v.amount,raw:e.line,score,index:j});
  }
  offers.push(choices.sort((a,b)=>b.score-a.score).slice(0,5));
 }
 return {entries,offers};
}
function addHints(rows,header){
 const occupied=new Set(),anchors=[];
 for(const row of rows){
  let best=-1,s=0;
  for(const e of header.entries){
   if(e.m.length||!/[A-Z]{4}/i.test(e.line))continue;
   const val=similarity(row.name,e.line);
   if(val>s){s=val;best=e.i}
  }
  anchors.push(s>=.38?best:-1);
 }
 for(let idx=0;idx<rows.length;idx++){
  const anchor=anchors[idx];if(anchor<0)continue;
  const candidates=[];
  header.entries.forEach((e,j)=>{
   if(occupied.has(j)||!e.m.length||!/^[0-9.,\s]+[A-C]?\s*$/.test(e.line))return;
   const dist=e.i-anchor;
   if(Math.abs(dist)>4)return;
   const val=e.m.at(-1).amount;
   if(val<=0||val>1000)return;
   const nextAnchor=anchors.slice(idx+1).find(x=>x>=0)??Infinity;
   // Una cifra situada entre dos nombres suele pertenecer al nombre más próximo.
   // Si es equidistante, en tickets fiscales el precio aparece a menudo ANTES del nombre.
   if(dist>0&&nextAnchor<Infinity&&nextAnchor-e.i<=dist) return;
   // Los posibles importes de promoción, sin código A/B/C, no son precios confirmados.
   const strength=e.vat?1.8:0,score=strength-Math.abs(dist)*.27+(dist<0?.55:0);
   candidates.push({j,value:val,line:e.line,score,vat:e.vat});
  });
  candidates.sort((a,b)=>b.score-a.score);
  if(!candidates.length)continue;
  const best=candidates[0];occupied.add(best.j);
  rows[idx].candidates.push({value:best.value,source:'cabecera',raw:best.line,provisional:true});
 }
}
function findDiscountTotal(passes){
 for(const p of passes||[]){
  const t=String(p.text||'');
  const m=t.match(/(?:DESC\.?\s*TOTAL\s*EN\s*COMPRA|TOTAL\s+OFERTA\s+LIDL\s+PLUS)\s*[:.]?\s*(?:\n|\s)+(\d+[,\.]\d{2})/i);
  if(m)return Number(m[1].replace(',','.'));
 }
 return null;
}
function parseVat(passes,total){
 const groups=[];
 for(const pass of passes||[]){
  const lines=String(pass.text||'').split(/\r?\n/).map(C);
  for(let i=0;i<lines.length;i++){
   const h=N(lines[i]);if(!/(?:TVA|IVA|IVAX).*(?:PVP|PN)|^(?:TVA|IVA|IVAX)%/.test(h))continue;
   const rows=[];
   for(let j=i+1;j<Math.min(lines.length,i+8);j++){
    const text=N(lines[j]);if(/^SUMA\b/.test(text))break;
    const m=text.match(/^\s*([ABC])O?\s*(4[%KH]|10[%KH]|21[%KH])/);
    if(!m)continue;
    const v=values(lines[j]);if(v.length<3)continue;
    const expected=Number(m[2].replace(/\D/g,'')),tax=v[0].amount,baseValue=v[1].amount,gross=v[2].amount;
    if(baseValue<=0||Math.abs(R(baseValue+tax)-gross)>.025||Math.abs(tax/baseValue*100-expected)>.7)continue;
    rows.push({code:m[1],rate:expected,vat:tax,base:baseValue,gross,source:pass.label,
      raw:lines[j],review:!m[2].endsWith('%')});
   }
   if(rows.length)groups.push(rows);
  }
 }
 groups.sort((a,b)=>b.length-a.length);
 const rows=groups[0]||[],baseValue=R(rows.reduce((n,x)=>n+x.base,0)),tax=R(rows.reduce((n,x)=>n+x.vat,0)),gross=R(rows.reduce((n,x)=>n+x.gross,0));
 const valid=rows.length===3&&new Set(rows.map(x=>x.rate)).size===3&&
    total>0&&Math.abs(gross-total)<.025&&Math.abs(R(baseValue+tax)-total)<.025;
 return {rows,base:valid?baseValue:null,tax:valid?tax:null,gross:valid?gross:null,status:valid?'validado':'pendiente',
  inferredRows:rows.filter(x=>x.review).length,
  warnings:valid&&rows.some(r=>r.review)?['Una etiqueta del tipo impositivo fue interpretada; comprueba los importes.']:valid?[]:['Tabla de IVA no validada con el total pagado.']};
}
function analyze(passes,fields){
 const fallback=base.analyze(passes,fields),complete=(passes||[]).filter(x=>['original','contraste'].includes(x.label)&&x.text);
 if(!complete.length)return {...fallback,version:'R8.15'};
 const full=complete.map(parseFull).sort((a,b)=>b.items.length-a.items.length);
 const left=full[0],right=full[1]||{items:[],promos:[]};
 const paired=merge(left.items,right.items);
 const rows=paired.map(({main,other},i)=>{
  const candidates=[];
  for(const p of [main,other])if(p?.price!==null&&p?.price!==undefined)candidates.push({value:p.price,source:p.label,raw:p.raw,provisional:!!p.reason.length});
  const vals=new Set(candidates.filter(x=>!x.provisional).map(x=>x.value));
  let gross=vals.size===1?[...vals][0]:null;
  if(vals.size>1)candidates.forEach(x=>x.provisional=true);
  let name=main.name;
  if(other&&similarity(main.name,other.name)>.6&&other.name.length>name.length&&!/\d+[,.]\d{3,}/.test(other.name))name=other.name;
  name=name.replace(/\s+\d{1,4}[,.]\d{1,3}\s*[ABC]?\s*$/i,'').replace(/\s+\d{2,3}\s*[ABC]\s*$/i,'').trim();
  if(other){
   const wa=base.canonical(main.name).split(' '),wb=base.canonical(other.name).split(' '),common=[];
   for(let j=0;j<Math.min(wa.length,wb.length);j++){if(wa[j]!==wb[j])break;common.push(wa[j])}
   if(common.length===1&&common[0].length>=7&&similarity(main.name,other.name)>.28&&
      !/\d/.test(common[0]))name=common[0];
  }
  const kg=main.weightKg??other?.weightKg??null,unitPrice=main.unitPrice??other?.unitPrice??null;
  const qty=main.quantity||other?.quantity||1;
  const notes=[...main.reason,...(other?.reason||[])];
  if(kg!==null&&unitPrice!==null){
   const computed=R(kg*unitPrice);
   if(gross!==null&&Math.abs(gross-computed)>.025){gross=null;notes.push('Importe incompatible con peso × precio/kg.')}
   if(gross===null)candidates.push({value:computed,source:'cálculo peso × precio/kg',raw:kg+' kg × '+unitPrice,provisional:true});
  }
  const vat=main.vat||other?.vat||null;
  return {id:'producto-'+(i+1),name:C(name),gross,discount:0,net:gross,quantity:qty,unit:kg!==null?'kg':'ud',unitPrice,weightKg:kg,
   vatCode:vat,vatRate:rate(vat),evidence:[{label:main.label,raw:main.raw},...(other?[{label:other.label,raw:other.raw}]:[])],
   discountEvidence:[],reviewReasons:notes,candidates,needsReview:gross===null,
   sourceLine:main.line,sourceLabel:main.label};
 });
 const cabecera=(passes||[]).find(x=>x.label==='cabecera');
 const h=cabecera?headerData(cabecera.text):{entries:[],offers:[]};
 addHints(rows,h);
 for(const row of rows){
  if(row.gross===null&&row.candidates.length){
   const strong=row.candidates.filter(x=>x.source==='cabecera');
   const confirmed=row.candidates.filter(x=>x.source!=='cabecera'&&!x.provisional);
   if(confirmed.length&&new Set(confirmed.map(x=>x.value)).size===1)row.gross=confirmed[0].value;
   else if(strong.length)row.proposal=strong[0].value;
   else row.proposal=row.candidates[0].value;
   if(row.proposal!==undefined)row.reviewReasons.push('Precio propuesto a partir de otra lectura: confirmar manualmente.');
  }
  if(row.gross!==null&&row.quantity>1&&row.unitPrice!==null&&row.unit!=='kg'&&Math.abs(R(row.unitPrice*row.quantity)-row.gross)>.025){
   row.gross=null;row.reviewReasons.push('Cantidad y precio unitario no concuerdan.');
  }
 }
 const promoSlots=full.slice().sort((a,b)=>b.promos.length-a.promos.length)[0].promos;
 const promoNumbers=h.offers;
 const statedDiscount=findDiscountTotal(passes||[]);
 let sum=0,applied=0,chosen=null;
 // Elegir entre importes OCR alternativos ÚNICAMENTE cuando el conjunto
 // coincide con la cifra de descuentos impresa. No duplicar una línea OCR.
 if(statedDiscount!==null&&promoSlots.length===promoNumbers.length&&promoNumbers.length&&promoNumbers.every(x=>x.length)){
  let bestScore=-Infinity;
  function search(i,soFar,total,used,score){
   if(i===promoNumbers.length){
    if(Math.abs(R(total)-statedDiscount)>.025)return;
    if(score>bestScore){bestScore=score;chosen=soFar.slice()}
    return;
   }
   for(const o of promoNumbers[i]){
    if(used.has(o.index))continue;
    used.add(o.index);soFar.push(o);
    search(i+1,soFar,total+o.value,used,score+o.score);
    soFar.pop();used.delete(o.index);
   }
  }
  search(0,[],0,new Set(),0);
  if(chosen){
   sum=R(chosen.reduce((n,x)=>n+x.value,0));
   promoSlots.forEach((p,i)=>{
    const row=rows[p.at],d=chosen[i].value;if(!row||d<=0)return;
    row.discount=d;row.discountEvidence.push({label:'cabecera',raw:chosen[i].raw,amount:d,signInferred:true});
    row.reviewReasons.push('Promoción recuperada por orden y cuadre del descuento total: comprobar.');
    applied++;
   });
  }
 }
 rows.forEach(x=>{x.net=x.gross===null?null:R(x.gross-x.discount);x.needsReview=x.gross===null||x.reviewReasons.length>0});
 const reconciliation=base.summary(rows,Number(fields?.amount||0));
 const fiscal=parseVat(passes,Number(fields?.amount||0));
 return {version:'R8.15',items:rows,reconciliation,fiscal,
   discountAudit:{stated:statedDiscount,readFromHeader:sum,assigned:R(rows.reduce((n,x)=>n+x.discount,0)),
     count:applied,slots:promoSlots.length,headOffers:promoNumbers.map(x=>x.map(y=>y.value))},
   warnings:applied===0&&promoSlots.length?['Se detectan promociones sin importes fiables; no se han asignado automáticamente.']:[],
   sourcePasses:(passes||[]).map(x=>({label:x.label,characters:x.text?.length||0,confidence:x.confidence||0})),provisional:true};
}
root.Gasto360DesgloseR815={analyze,parseFull,parseVat,headerData,summary:base.summary,
 normalizeEditable:base.normalizeEditable,canonical:base.canonical,round:R};
if(typeof module!=='undefined'&&module.exports)module.exports=root.Gasto360DesgloseR815;
})(typeof window!=='undefined'?window:globalThis);