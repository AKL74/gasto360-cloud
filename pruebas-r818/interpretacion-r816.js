(function(root){
'use strict';
/* Gasto360 R8.16 — lector de líneas de compra y productos al peso.
   Complementa R8.15. Sin almacenamiento, peticiones de red ni datos reales. */
const previous=root.Gasto360DesgloseR815;
if(!previous)throw Error('R8.16 necesita R8.15');
const round=previous.round;
const N=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const C=s=>String(s||'').replace(/\s+/g,' ').trim();
const parseMoney=s=>{let v=String(s||'').trim().replace(/\s/g,'').replace('€','');
 if(v.includes(','))v=v.replace(/\./g,'').replace(',','.');
 const n=Number(v);return Number.isFinite(n)?round(n):null;
};
const amounts=s=>Array.from(String(s||'').matchAll(/\d{1,4}[.,]\d{2}(?!\d)/g))
 .map(m=>({value:parseMoney(m[0]),start:m.index,end:m.index+m[0].length,raw:m[0]}))
 .filter(m=>m.value!==null);
const paymentLine=s=>/^\s*(?:TARJETA\s+BANCAR(?:IA|I|L)?\b|TARJ\.\s*BANCAR|TAR\.?\s*BANCAR|PAGO\s+(?:TARJETA|EFECTIVO)|EFECTIVO\b|ENTREGA\b|CAMBIO\b|IMPORTE\s*:|VENTA\s+CONTADO\b)/i.test(N(s));
const isStop=s=>/^\s*(?:TOTAL\b|T[O0]TAL\b|T0TAL\b|TOTA[LI]\b|TARJETA\s+BANCAR|EFECTIVO\b|ENTREGA\b|CAMBIO\b|IVA\s+BASE\b|BASE\s+IMPONIBLE\b|IMPORTE\s*:)/i.test(N(s));
function nameClean(s){
 return C(String(s||'').replace(/^[\s|Il!]+/,'').replace(/^\s*[1I|]\s+(?=[\wÁÉÍÓÚÑ])/i,''))
 .replace(/^[|]\s*/,'').trim();
}
function isDetailedLayout(passes){
 return (passes||[]).some(p=>/(?:DESCRIPCI[ÓO]N|DESCRIPCION).{0,25}(?:P[.\s]*UNIT|IMP[.()]|PRECIO)/i.test(N(p.text||'')) &&
 /(?:[.,]\d{2}).*(?:\n|$)/.test(p.text||''));
}
function parseDetailedPass(pass){
 const lines=String(pass?.text||'').split(/\r?\n/).map(C);
 let begin=lines.findIndex(s=>/DESCRIPCI[ÓO]N/.test(N(s))&&/(?:P[.\s]*UNIT|IMP[.()]|PRECIO)/i.test(N(s)));
 if(begin<0)return {label:pass?.label||'desconocido',items:[],issues:['No hay tabla detallada de productos']};
 let end=lines.findIndex((s,i)=>i>begin&&isStop(s));
 if(end<0)end=lines.length;
 const items=[],issues=[];
 for(let i=begin+1;i<end;i++){
  const line=lines[i],up=N(line);if(!line)continue;
  const kg=/^([0-9]+[.,][0-9]{3})\s*KG\s+([0-9]+[.,][0-9]{2})\s*(?:€|EUR)\s*\/\s*K[G9Y]\s*(?:([0-9]+[.,][0-9]{2}))?/i.exec(up);
  if(kg){
   const last=items.at(-1);
   if(!last){issues.push('Peso sin producto: '+line);continue}
   const weight=Number(kg[1].replace(',','.')),price=Number(kg[2].replace(',','.'));
   // Último precio del renglón, no el precio unitario, si ambas magnitudes aparecen.
   const printed=kg[3]?parseMoney(kg[3]):null;
   const calculated=round(weight*price);
   last.weightKg=weight;last.unitPrice=price;last.unit='kg';last.quantity=1;
   last.computed=calculated;last.weightLine=line;
   last.printed=printed;
   last.gross=printed!==null&&Math.abs(printed-calculated)<.025?printed:null;
   if(printed!==null&&Math.abs(printed-calculated)>=.025)
     last.reviewReasons.push('Precio impreso OCR ('+printed.toFixed(2)+') no coincide con peso × precio ('+calculated.toFixed(2)+').');
   if(printed===null)last.reviewReasons.push('Total de producto al peso no legible.');
   continue;
  }
  if(paymentLine(line)||isStop(line))break;
  if(/^(?:\d[\d\s.,€]*$|[|!]+$|IVA\b|CUOTA\b|BASE\b)/i.test(up))continue;
  if(!/[A-ZÁÉÍÓÚÜÑ]{3}/i.test(up)||/^\d{1,4}[\/-]\d{1,2}/.test(up))continue;
  const lastMoney=amounts(line).at(-1);
  let name=line,gross=null;
  // Importe cuando aparece después del producto; no inventar precio de un número de referencia.
  if(lastMoney&&line.slice(lastMoney.end).trim()===''&&lastMoney.start>=3){
   name=line.slice(0,lastMoney.start).trim();gross=lastMoney.value;
  }
  name=nameClean(name);
  if(!name||/^(?:IVA|CUOTA|BASE|TOTAL|DESCUENTO|TARJETA|FACTURA|IMPORTE|EUR)\b/.test(N(name)))continue;
  items.push({name,gross,quantity:1,unit:'ud',unitPrice:null,weightKg:null,printed:gross,computed:null,
    evidence:[{label:pass.label,raw:line}],reviewReasons:[],sourceLabel:pass.label,sourceLine:i});
 }
 return {label:pass.label,items,issues};
}
function nameSimilarity(a,b){
 const aa=new Set(previous.canonical(a).split(' ').filter(x=>x.length>2));
 const bb=new Set(previous.canonical(b).split(' ').filter(x=>x.length>2));
 let overlap=0;for(const w of aa)if(bb.has(w))overlap++;
 return overlap/Math.max(1,aa.size,bb.size);
}
function mergePasses(passes){
 const parsed=passes.filter(p=>/^(?:original|contraste)$/.test(p.label)).map(parseDetailedPass);
 parsed.sort((a,b)=>b.items.length-a.items.length);
 if(!parsed.length||!parsed[0].items.length)return [];
 const base=parsed[0].items,second=parsed[1]?.items||[];
 const result=[],used=new Set();
 for(let i=0;i<base.length;i++){
  const a=base[i];let best=-1,score=-1;
  for(let j=0;j<second.length;j++){
   if(used.has(j))continue;
   const sim=nameSimilarity(a.name,second[j].name);
   const distance=Math.abs(i-j);
   const value=sim+.2*Math.max(0,1-distance/4);
   if((sim>=.45||sim>=.25&&distance<=1)&&value>score){score=value;best=j}
  }
  const b=best>=0?second[best]:null;if(b)used.add(best);
  let name=a.name;
  if(b&&nameSimilarity(a.name,b.name)>.7){
   if(/[|!]/.test(name)&&!/[|!]/.test(b.name))name=b.name;
  }
  const evidence=[...a.evidence,...(b?.evidence||[])];
  if(a.weightLine)evidence.push({label:a.sourceLabel,raw:a.weightLine});
  if(b?.weightLine)evidence.push({label:b.sourceLabel,raw:b.weightLine});
  const weighted=a.weightKg!==null||b?.weightKg!==null;
  const reasons=[],candidates=[];
  let gross=null,unit='ud',weightKg=null,unitPrice=null;
  if(weighted){
   unit='kg';weightKg=a.weightKg??b?.weightKg??null;unitPrice=a.unitPrice??b?.unitPrice??null;
   const computed=weightKg!==null&&unitPrice!==null?round(weightKg*unitPrice):null;
   const calculations=[a.computed,b?.computed].filter(x=>x!==null&&x!==undefined);
   if(computed!==null&&calculations.some(v=>Math.abs(v-computed)>.025)){
    reasons.push('Las lecturas discrepan sobre peso o precio/kg.');
   }
   const matched=[a,b].filter(Boolean).filter(p=>p.weightKg!==null&&p.printed!==null);
   for(const x of matched){
    candidates.push({value:x.printed,source:x.sourceLabel,raw:x.weightLine||'',provisional:x.gross===null});
    if(x.gross===null)reasons.push('Lectura '+x.sourceLabel+': subtotal incoherente con el peso.');
   }
   const valid=matched.filter(x=>x.gross!==null);
   if(computed!==null&&valid.length>0&&valid.every(x=>Math.abs(x.gross-computed)<.025)&&
       !calculations.some(v=>Math.abs(v-computed)>.025)){
    gross=computed;
   }else if(computed!==null){
    candidates.push({value:computed,source:'kg × €/kg',raw:weightKg+' × '+unitPrice,provisional:true});
    reasons.push('Subtotal calculado sin confirmación OCR suficiente.');
   }
   if(computed!==null&&gross!==null)candidates.push({value:computed,source:'kg × €/kg',raw:weightKg+' × '+unitPrice,provisional:false});
  }else{
   const prices=[a,b].filter(Boolean).map(x=>({value:x.gross,source:x.sourceLabel,raw:x.evidence[0].raw})).filter(x=>x.value!==null);
   prices.forEach(x=>candidates.push({...x,provisional:false}));
   const set=new Set(prices.map(x=>x.value));
   if(set.size===1)gross=prices[0].value;
   else if(set.size>1)reasons.push('Importes contradictorios entre lecturas.');
  }
  result.push({id:'producto-'+(result.length+1),name,gross,discount:0,net:gross,quantity:1,unit,unitPrice,weightKg,
    vatCode:null,vatRate:null,evidence,discountEvidence:[],reviewReasons:reasons,
    candidates,needsReview:gross===null||reasons.length>0,
    sourceLine:a.sourceLine,sourceLabel:a.sourceLabel});
 }
 return result;
}
function fiscalRows(passes){
 // Formato Base Imponible y Cuota: la tercera cifra NO es un PVP sino la cuota de IVA.
 const groups=[];
 for(const pass of passes){
  const lines=String(pass.text||'').split(/\r?\n/).map(C);
  for(let i=0;i<lines.length;i++){
   if(!/(?:IVA|LVA).*(?:BASE\s+IMPONIBLE)/.test(N(lines[i])))continue;
   const rows=[];
   for(let j=i+1;j<Math.min(i+6,lines.length);j++){
    const line=N(lines[j]);
    if(/^TOTAL\b/.test(line))break;
    const m=/^\s*(4|10|21)\s*%\s+(\d{1,4}[.,]\d{2})\s+(\d{1,4}[.,]\d{2})/.exec(line);
    if(!m)continue;

    const rate=Number(m[1]),base=parseMoney(m[2]),vat=parseMoney(m[3]);
    if(base===null||vat===null||Math.abs(round(base*rate/100)-vat)>.025)continue;
    rows.push({rate,code:null,base,vat,gross:round(base+vat),source:pass.label,raw:lines[j],review:false});
   }
   if(rows.length)groups.push(rows);
  }
 }
 groups.sort((a,b)=>b.length-a.length);
 const rows=groups[0]||[];
 const uniqueRates=new Set(rows.map(x=>x.rate));
 const base=round(rows.reduce((v,x)=>v+x.base,0));
 const tax=round(rows.reduce((v,x)=>v+x.vat,0));
 const gross=round(base+tax);
 // At least two independent VAT lines must be present; 4/10/21 each optional.
 const valid=rows.length>=2&&uniqueRates.size===rows.length&&gross>0;
 return {rows,base:valid?base:null,tax:valid?tax:null,gross:valid?gross:null,
  status:valid?'validado':'pendiente',inferredRows:0,
  warnings:valid?[]:['La tabla fiscal no tiene al menos dos cuotas consistentes.']};
}
function amountEvidence(passes,products,fiscal,fields){
 const sum=round(products.reduce((v,x)=>v+Number(x.net??0),0));
 const allProducts=products.length>0&&products.every(x=>x.net!==null);
 const explicit=[];
 for(const p of passes){
  for(const line of String(p.text||'').split(/\r?\n/)){
   const u=N(line),m=amounts(line).at(-1);
   if(!m)continue;
   if(/^\s*TOTAL\b/i.test(u)&&amounts(line).length>1)continue; // TOTAL base/cuota IVA no es total de pago.
   if(/^\s*(?:IMPORTE\s*:|IMP\s*[.:]|TARJETA\s+BANCAR|TOTAL\b)/i.test(u))
    explicit.push({amount:m.value,source:p.label,kind:/^\s*IMPORTE\s*:/.test(u)?'importe':/^\s*TARJETA/.test(u)?'tarjeta':'total',raw:line});
  }
 }
 // La fiscalidad, los renglones y un 'Importe' de pago deben ser fuentes independientes.
 const matching=explicit.filter(e=>e.kind==='importe'&&fiscal.gross!==null&&Math.abs(e.amount-fiscal.gross)<.025);
 const verified=allProducts&&fiscal.status==='validado'&&Math.abs(sum-fiscal.gross)<.025&&matching.length>0;
 return {verified,productSum:allProducts?sum:null,fiscalTotal:fiscal.gross,confirmed:verified?fiscal.gross:null,
  observations:explicit,ocrOriginal:Number(fields?.amount)||null,
  mismatches:explicit.filter(e=>fiscal.gross!==null&&Math.abs(e.amount-fiscal.gross)>.025)};
}
function analyze(passes,fields){
 const source=passes||[];
 let base=previous.analyze(source,fields);
 // Política global: pagos, cambios y tarjetas no son artículos aunque el lector OCR se confunda.
 if(base.items?.some(x=>paymentLine(x.name))){
  base.items=base.items.filter(x=>!paymentLine(x.name));
  base.reconciliation=previous.summary(base.items,Number(fields?.amount||0));
 }
 if(!isDetailedLayout(source))return {...base,version:'R8.16'};
 const products=mergePasses(source);
 if(!products.length)return {...base,version:'R8.16'};
 const fiscal=fiscalRows(source);
 const amountsAudit=amountEvidence(source,products,fiscal,fields);
 const amount=amountsAudit.verified?amountsAudit.confirmed:Number(fields?.amount||0);
 if(fiscal.gross!==null&&Math.abs(fiscal.gross-amount)>.025){
  fiscal.status='pendiente';fiscal.warnings.push('IVA y total pagado no coinciden.');
 }
 const reconciliation=previous.summary(products,amount);
 if(products.some(x=>x.needsReview))reconciliation.status='pendiente';
 const warning=amountsAudit.verified&&Math.abs(Number(fields.amount)-amount)>.025?
  'Importe principal OCR '+Number(fields.amount).toFixed(2)+' € contradice pago, productos e impuestos; total reconciliado '+amount.toFixed(2)+' €.':'';
 return {version:'R8.16',items:products,reconciliation,fiscal,
  amountAudit:{...amountsAudit,corrected:amountsAudit.verified&&Math.abs(Number(fields.amount)-amount)>.025,amount},
  discountAudit:{stated:null,readFromHeader:0,assigned:0,count:0,slots:0,headOffers:[]},
  warnings:[...(warning?[warning]:[])],
  sourcePasses:source.map(x=>({label:x.label,characters:x.text?.length||0,confidence:x.confidence||0})),
  provisional:reconciliation.status!=='cuadrado'};
}
function applyResult(fields,analysis,passes=[]){
 // Identificador fiscal del establecimiento separado por guion: A-12345678.
 if(!fields.taxId){
  for(const pass of passes){
   const tax=String(pass.text||'').match(/(?:^|\n)\s*([A-HJ-NP-SUVW])\s*[- ]\s*(\d{8})\s*(?=\n|$)/m);
   if(tax){fields.taxId=tax[1]+tax[2];break;}
  }
 }
 if(!analysis?.amountAudit?.corrected)return fields;
 const old=Number(fields.amount),corrected=Number(analysis.amountAudit.amount);
 fields.amount=corrected;
 fields.amountCandidates=[corrected];
 fields.confidence={...(fields.confidence||{}),amount:95};
 fields.flags=(fields.flags||[]).filter(x=>!x.includes('Hay varios importes reconocidos'));
 fields.flags.push('Importe OCR '+old.toFixed(2)+' € corregido por conciliación independiente a '+corrected.toFixed(2)+' € (verifica el ticket).');
 fields.totalSource='Productos + IVA + importe abonado';
 return fields;
}
root.Gasto360DesgloseR816={analyze,applyResult,parseDetailedPass,mergePasses,fiscalRows,amountEvidence,
 summary:previous.summary,normalizeEditable:previous.normalizeEditable,canonical:previous.canonical,round};
if(typeof module!=='undefined'&&module.exports)module.exports=root.Gasto360DesgloseR816;
})(typeof window!=='undefined'?window:globalThis);