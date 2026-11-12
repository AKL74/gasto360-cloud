(function(root){
'use strict';
/* Gasto360 R8.10: análisis conservador del ticket, sin servicios de IA externos. */
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const clean=s=>String(s||'').replace(/[|_*~]/g,' ').replace(/\s+/g,' ').trim();
const RULES=[
 [/MERCA\s*D[O0]NA|MERCAD[O0]NA/,'MERCADONA, S.A.','Alimentación'],
 [/\bA[L1]CAM[PPR][O0]\b|\bAL\s+CAMPO\b/,'ALCAMPO','Alimentación'],
 [/\bL[I1|]D[L1]\b/,'LIDL','Alimentación'],
 [/\bGRUPO DIA\b|\bSUPERMERCADOS DIA\b|\bDIA\b/,'GRUPO DÍA','Alimentación'],
 [/\bPRIM[O0]R\b/,'PRIMOR','Salud'],
 [/\b100 MONTADITOS\b/,'100 MONTADITOS','Alimentación'],
 [/\bTGB\b|THE GOOD BURGER/,'TGB The Good Burger','Alimentación'],
 [/\bASADOR REAL\b/,'ASADOR REAL','Alimentación'],
 [/\bCARREFOUR\b/,'CARREFOUR','Alimentación'],
 [/\bALDI\b/,'ALDI','Alimentación'],
 [/\bREPSOL\b/,'REPSOL','Vehículo'],
 [/\bCEPSA\b/,'CEPSA','Vehículo'],
 [/\bSHELL\b/,'SHELL','Vehículo']
];
function moneyVals(line){
 const v=[],re=/(?<![\d.,])(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,6}[.,]\d{2})(?![\d.,])/g;
 for(const m of String(line||'').matchAll(re)){
  const raw=m[1],n=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);
  if(Number.isFinite(n)&&n>=0&&n<100000)v.push(n);
 }
 return v;
}
function validDate(y,m,d){
 const dt=new Date(Date.UTC(y,m-1,d));
 return y>=2000&&y<=new Date().getFullYear()+1&&dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d;
}
function parseDate(text){
 const lines=String(text||'').split(/\r?\n/),found=[];
 lines.forEach((line,i)=>{
  const u=norm(line),s=norm(lines.slice(Math.max(0,i-1),i+1).join(' '));
  const re=/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b|\b(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/g;
  for(const x of u.matchAll(re)){
   let y,m,d;
   if(x[4]){y=Number(x[4]);m=Number(x[5]);d=Number(x[6]);}
   else {d=Number(x[1]);m=Number(x[2]);y=Number(x[3]);if(y<100)y+=2000;}
   if(!validDate(y,m,d))continue;
   const score=10+(/\bFECHA\b|F\.\s*EMISION|EMITIDO|FACTURA SIMPLIFICADA/.test(s)?35:0)+(/\bHORA\b/.test(u)?5:0)-i*.1;
   found.push({date:String(y)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'),score});
  }
 });
 found.sort((a,b)=>b.score-a.score);
 return found[0]?.date||'';
}
function merchants(lines,known=[]){
 const head=norm(lines.slice(0,22).filter(l=>!/(PROMO|PLUS|DESCUENTO|OFERTA|AHORRO|VENTA CONTADO|TOTAL OFERTA|ENTREGA)/.test(norm(l))).join(' ')),all=norm(lines.join(' ')),out=[];
 for(const [re,name,cat] of RULES)if(re.test(head))out.push({name,cat,score:98,verified:true});
 for(const km of known){
  const nk=norm(km);if(nk.length>=5&&head.includes(nk))out.push({name:km,cat:null,score:93,verified:true});
 }
 if(!out.length)lines.slice(0,10).forEach((l,i)=>{
  const u=norm(l),letters=(u.match(/[A-Z]/g)||[]).length,digits=(u.match(/\d/g)||[]).length;
  if(letters<5||digits>letters||/VENTA CONTADO|VENTA EFECTIVO|RECIBO PARA|CLIENTE|OPERACION|APROBADA|CONTACTLESS|TERMINAL|IMPORTE|IMP\.|EUR|GRUPOs+TARJETA|FACTURA|TICKET|RECIBO|FECHA|HORA|TELEF|TOTAL|CUOTA|IVA|BASE|GRACIAS|CAJA|PAGO|TARJETA|DIRECCION|CALLE|AVDA|PROVINCIA|WWW\.|HTTP|NIF|CIF|ENTREGA|PROMO|DESCUENTO|AHORRO|EJEMPLAR/.test(u))return;
  const score=72-i*4+(/\bS\.?A\.?\b|\bS\.?L\.?\b|\bSLU\b/.test(u)?6:0)-(u.length>38?20:0);
  out.push({name:clean(l),cat:null,score,verified:false});
 });
 const unique=[],seen=new Set();
 for(const m of out.sort((a,b)=>b.score-a.score)){const k=norm(m.name);if(!seen.has(k)){unique.push(m);seen.add(k)}}
 return unique.slice(0,5);
}
function kind(text){
 const u=norm(text);
 return /GETNET|REDSYS|TPV|NUM\.?\s*AUT|NUM\.?\s*OPERACION|AUTORIZACION|OPERACION\s*:\s*\d+|PAGO CON TARJETA/.test(u)&&!(/DESCRIPCION\s+ARTICULOS|BASE IMPONIBLE|FACTURA SIMPLIFICADA/.test(u))?'justificante_tarjeta':'ticket';
}
function detectTotals(lines,type){
 const ranked=[];
 const hasTicketTotal=lines.some(l=>/\b(?:TOTAL|T0TAL)\s*(?:A PAGAR|COMPRA|PAGADO)?\b|\bIMP\.\s*:/i.test(norm(l)));
 lines.forEach((l,i)=>{
  const u=norm(l).replace(/\bT[O0][T7][A4][L1I]\b/g,'TOTAL').replace(/\bLO[T7]AL\b/g,'TOTAL'),numbers=moneyVals(l);
  const excluded=/OFERTA|PLUS|AHORRO|AHORRADO|DESCUENT|CUPON|PROMO|REDONDEO|ENTREGA|CAMBIO|DEVOLU|DEVUELTO|RECIBIDO|PUNTOS|BASE IMPONIBLE|\bIVA\b|\bCUOTA\b|PRECIO UNITARIO|IMPUESTO|RETENCION|DESGLOSE/.test(u);
  if(excluded)return;
  const following=moneyVals(lines[i+1]||'');
  if(!numbers.length&&!following.length)return;
  let weight=0,source='';
  if(/\bIMP\.\s*[:=\-]\s*[\d]/.test(u)||/\bIMPORTE\s*(?:PAGADO|ABONADO|COBRADO|TOTAL)\b/.test(u)){weight=98;source='importe abonado'}
  else if(/\bTOTAL\s+(?:A\s+PAGAR|PAGADO|COMPRA)\b/.test(u)){weight=96;source='total compra'}
  else if(/\bA\s+PAGAR\b/.test(u)){weight=94;source='a pagar'}
  else if(/^\s*TOTAL\b/.test(u)){weight=91;source='total del ticket'}
  else if(/\bTARJETA BANCARIA\b|\bPAGO CON TARJETA\b/.test(u)){weight=87;source='pago'}
  else if(type==='justificante_tarjeta'&&/\bIMP\.\s*:|\bEUR\b|€/.test(u)){weight=76;source='justificante'}
  if(!weight)return;
  // No atribuir el importe de otra línea a una etiqueta aislada salvo continuidad inmediata.
  const v=numbers.length?numbers[numbers.length-1]:following[0];
  if(!(v>0))return;
  ranked.push({value:v,score:weight-(numbers.length?0:12)-(numbers.length>2?10:0),line:i,source});
 });
 const tx=taxValues(lines);
 const fiscal=tx.base!==null&&tx.tax>0?Number((tx.base+tx.tax).toFixed(2)):null;
 if(fiscal!==null&&fiscal>0&&tx.validated){
  const close=ranked.find(r=>Math.abs(r.value-fiscal)<=.03);
  // Cuadre fiscal, no suma arbitraria de productos.
  if(close)close.score+=12;
  else ranked.push({value:fiscal,score:83,line:-1,source:'cuadre fiscal inferido'});
 }
 ranked.sort((a,b)=>b.score-a.score);
 const cand=[],seen=new Set();
 for(const r of ranked){const k=r.value.toFixed(2);if(!seen.has(k)){seen.add(k);cand.push(r.value)}}
 const selected=ranked[0];
 return {total:selected?.value??'',candidates:cand.slice(0,8),labelFound:!!selected,
  source:selected?.source||'',score:selected?.score||0,
  inferred:selected?.source==='cuadre fiscal inferido',fiscal};
}
function taxValues(lines){
 // Interpretación de la tabla fiscal de algunos supermercados:
 // "IVA + PN = PP" seguido de "Suma 5,17 37,31 42,48".
 for(let i=0;i<lines.length;i++){
  const u=norm(lines[i]);
  if(!/\bSUMA\b|\bTOTAL IVA\b/.test(u))continue;
  const preceding=norm(lines.slice(Math.max(0,i-14),i).join(' '));
  if(!/\bIVA\b/.test(preceding)||!/\b(PN|BASE|IMPONIBLE|CUOTA|PP)\b/.test(preceding))continue;
  const v=moneyVals(lines[i]);
  if(v.length>=2&&v[0]>0&&v[1]>0){
   // La columna de cuota de IVA precede a la base en este diseño de tabla.
   const tax=Number(v[0].toFixed(2)),base=Number(v[1].toFixed(2));
   const rows=lines.slice(Math.max(0,i-6),i).map(x=>moneyVals(x)).filter(v=>v.length>=3);
   let validated=false;
   if(rows.length>=2){
    const totalTax=rows.reduce((n,v)=>n+v[0],0);
    const totalBase=rows.reduce((n,v)=>n+v[1],0);
    validated=Math.abs(totalTax-tax)<.04&&Math.abs(totalBase-base)<.04;
   }
   // Si no se leen suficientes filas, el encabezado es evidencia,
   // pero no se inventará un total a partir del subtotal.
   return {tax,base,validated,source:'tabla fiscal'};
  }
 }
 let tax=0,base=null;
 for(const line of lines){
  const u=norm(line),v=moneyVals(line);
  if(/\b(?:CUOTA IVA|IVA\s+\d{1,2}\s*%|TOTAL IVA)\b/.test(u)&&v.length){
   if(v.length>=2&&/\bIVA\s+\d{1,2}\s*%/.test(u)){tax=v[v.length-1];base=v[v.length-2]}
   else tax=v[v.length-1];
  }
 }
 return {tax,base,validated:false,source:tax>0?'cuota suelta':''};
}
function items(lines){
 const begin=lines.findIndex(l=>/DESCRIPCION|ARTICULOS|PRODUCTOS|DESCRIPCIO\b/.test(norm(l)));
 const start=begin>=0?begin+1:Math.min(3,lines.length);
 const out=[];
 for(let i=start;i<lines.length&&i<start+75;i++){
  const raw=clean(lines[i]),u=norm(raw);
  if(/^(?:TOTAL|LOTAL|T0TAL|SUBTOTAL|ENTREGA|VENTA CONTADO|RECIBO PARA EL CLIENTE|BASE|IVA\b|CUOTA|IMP\.\s*:|SUMA|A PAGAR)/.test(u))break;
  if(/^\s*\d+[.,]\d+\s*(?:KG|G|GR|L)\s*[X×*]/.test(u))continue;
  if(/\/KG\b|EUR\/K|PROMO|LIDL PLUS|CUPON|DESCUENT|OFERTA|AHORRO|ENTREGA|FECHA|FACTURA|NIF|TELEF|CIF|TICKET|GRACIAS|PAGO\b/.test(u))continue;
  const m=raw.match(/\s+(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,5}[.,]\d{2})\s*(?:EUR|€|[ABC])?\s*$/i);
  if(!m)continue;
  const amount=moneyVals(m[1])[0],name=clean(raw.slice(0,m.index)).replace(/^\s*\d{1,2}\s*(?:X|×)?\s+/i,'');
  if(!(amount>0)||name.length<3||!/\p{L}/u.test(name)||/^\d+(?:[,.]\d+)?\s*(?:KG|G|L)\b/.test(norm(name)))continue;
  out.push({name,amounts:[amount],price:amount});
 }
 return out.slice(0,40);
}
function paymentFrom(text){
 const u=norm(text);
 const explicitCard=/\bVISA\b|MASTER\s*CARD|\bMAESTRO\b|\bTARJETA\b|CONTACTLESS|\bTPV\b|\bGETNET\b|\bREDSYS\b|\bDATAFONO\b/.test(u);
 const maskedCard=/\b\d{4,8}\s*[*X•]{4,}\s*\d{2}(?:\s*\d{2})?\b/.test(u);
 const bankSlip=/\bVENTA CONTADO\b/.test(u)&&/\bRECIBO PARA EL CLIENTE\b/.test(u)&&/\bIMP\.\s*:\s*\d/.test(u);
 const cash=/\bEFECTIVO\b|\bMETALICO\b|\bCASH\b|ENTREGA EFECTIVO/.test(u);
 if(/\bBIZUM\b/.test(u))return 'Bizum';
 if((explicitCard||maskedCard||bankSlip)&&!cash)return 'Tarjeta';
 if(cash&&!(explicitCard||maskedCard||bankSlip))return 'Efectivo';
 if(cash&&(maskedCard||bankSlip))return 'Otro'; // pagos mixtos: revisión humana
 return 'Otro'; // "VENTA CONTADO" por sí sola NO significa efectivo.
}
function taxId(text){
 const u=norm(text);
 const m=u.match(/\b([ABCDEFGHJNPQRSUVW]\d{8})\b/);
 return m?m[1]:'';
}
function invoice(text){
 const u=norm(text);
 const m=u.match(/(?:FACTURA|TICKET)\s*(?:SIMPLIFICADA)?\s*(?:N|NRO|NUM|Nº|NUMERO|#|:)?\s*[:#-]?\s*([0-9A-Z][0-9A-Z\/-]{5,})/);
 return m&&!/SIMPLIFICADA/.test(m[1])?m[1]:'';
}
function extract(text,ocrConf,known=[]){
 const lines=String(text||'').split(/\r?\n/).map(clean).filter(s=>s.length>1);
 const type=kind(text),mc=merchants(lines,known),tot=detectTotals(lines,type),tx=taxValues(lines),it=type==='ticket'?items(lines):[];
 const date=parseDate(text),merchant=mc[0]?.verified?mc[0].name:'',concept=it.length?it.slice(0,3).map(x=>x.name).join(' + '):(type==='justificante_tarjeta'?'Pago con tarjeta':(merchant?'Compra en '+merchant:''));
 const category=mc[0]?.verified?(mc[0]?.cat||'Otros'):'Otros';
 const quality=Math.max(.45,Math.min(1,Number(ocrConf||0)/90));
 const confidence={
  merchant:merchant?Math.round((mc[0]?.score||65)*quality):0,
  date:date?Math.round(94*quality):0,
  amount:tot.labelFound?Math.round(Math.min(98,Math.max(45,tot.score))*quality):0,
  tax:tx.tax>0?Math.round((tx.validated?95:65)*quality):0,
  concept:it.length?Math.round(85*quality):(type==='justificante_tarjeta'?Math.round(72*quality):35)
 };
 const overall=Math.round((confidence.merchant+confidence.date+confidence.amount+confidence.concept+Math.max(0,Number(ocrConf||0)))/5);
 const flags=[];
 if(type==='justificante_tarjeta')flags.push('Justificante de pago: no equivale a una factura desglosada.');
 if(mc.filter(x=>x.verified).length>1)flags.push('Se detectan varios comercios: comprueba que el recorte contiene un solo ticket.');
 if(!date)flags.push('Fecha no verificada: introduce la fecha del ticket.');
 if(tot.total==='')flags.push('Importe total no verificado: introdúcelo manualmente.');
 if(tot.inferred)flags.push('Total inferido del desglose fiscal; verifica el importe real del pago.');
 if(!merchant)flags.push('Comercio no verificado.');
 if(paymentFrom(text)==='Otro')flags.push('No se ha confirmado la forma de pago.');
 if(type==='ticket'&&!it.length)flags.push('No se han reconocido productos individuales.');
 return {merchant,date,amount:tot.total,tax:tx.tax,base:tx.base,concept,category,payment:paymentFrom(text),
  taxId:taxId(text),invoiceNo:invoice(text),items:it,merchantCandidates:mc,amountCandidates:tot.candidates,
  confidence,overall,lines,documentType:type,flags,totalSource:tot.source,fiscalValidated:tx.validated};
}
function scoreQuad(p,w,h,sample){
 if(!p||p.length!==4)return 0;
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),width=(dist(p[0],p[1])+dist(p[3],p[2]))/2;
 const height=(dist(p[0],p[3])+dist(p[1],p[2]))/2,ratio=height/Math.max(width,1);
 const area=Math.abs(p.reduce((a,x,i)=>a+x.x*p[(i+1)%4].y-p[(i+1)%4].x*x.y,0))/2/(w*h);
 if(area<.003||area>.85)return 0;
 const portrait=ratio>=1.15&&ratio<=9?1:(ratio>=.9&&ratio<=10?.35:0);
 let paper=.25;
 if(sample&&sample.data){
  let total=0,whites=0;
  for(let yy=1;yy<=9;yy++)for(let xx=1;xx<=5;xx++){
   const u=xx/6,v=yy/10;
   const x=(1-v)*((1-u)*p[0].x+u*p[1].x)+v*((1-u)*p[3].x+u*p[2].x);
   const y=(1-v)*((1-u)*p[0].y+u*p[1].y)+v*((1-u)*p[3].y+u*p[2].y);
   const sx=Math.floor(x/w*sample.width),sy=Math.floor(y/h*sample.height);
   if(sx<0||sy<0||sx>=sample.width||sy>=sample.height)continue;
   const i=(sy*sample.width+sx)*4,r=sample.data[i],g=sample.data[i+1],b=sample.data[i+2];
   const lum=.299*r+.587*g+.114*b;
   whites+=(lum>133&&(Math.max(r,g,b)-Math.min(r,g,b))<62)?1:0;total++;
  }
  paper=total?whites/total:0;
 }
 const cx=p.reduce((a,x)=>a+x.x,0)/4,cy=p.reduce((a,x)=>a+x.y,0)/4;
 const center=1-Math.min(1,Math.hypot((cx-w/2)/(w/2),(cy-h/2)/(h/2))/1.4);
 const coverage=Math.min(1,area/.075)*Math.max(0,1-Math.max(0,area-.38)/.4);
 const borderPenalty=(p.some(q=>q.x<w*.02||q.x>w*.98)&&Math.abs(cx-w/2)>w*.22)?.25:0;
 return .42*paper+.35*portrait+.15*center+.08*coverage-borderPenalty;
}
const api={moneyVals,parseDate,detectTotals,extract,scoreQuad,kind};
root.Gasto360ScanR86=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
