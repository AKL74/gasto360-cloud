(function(root){
'use strict';
/* Gasto360 R8.6: análisis conservador del ticket, sin servicios de IA externos. */
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
 const head=norm(lines.slice(0,22).join(' ')),all=norm(lines.join(' ')),out=[];
 for(const [re,name,cat] of RULES)if(re.test(head))out.push({name,cat,score:98,verified:true});
 for(const km of known){
  const nk=norm(km);if(nk.length>=5&&head.includes(nk))out.push({name:km,cat:null,score:93,verified:true});
 }
 if(!out.length)lines.slice(0,10).forEach((l,i)=>{
  const u=norm(l),letters=(u.match(/[A-Z]/g)||[]).length,digits=(u.match(/\d/g)||[]).length;
  if(letters<4||digits>letters||/FACTURA|TICKET|RECIBO|FECHA|HORA|TELEF|TOTAL|CUOTA|IVA|BASE|GRACIAS|CAJA|PAGO|TARJETA|DIRECCION|CALLE|AVDA|PROVINCIA|WWW\.|HTTP|NIF|CIF/.test(u))return;
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
 const moneyLines=lines.map(l=>moneyVals(l));
 const ranked=[];
 lines.forEach((l,i)=>{
  const u=norm(l).replace(/\bT[O0][T7][A4][L1I]\b/g,'TOTAL').replace(/\bT[O0]TA[L1I]\b/g,'TOTAL'),nums=moneyLines[i];
  if(!nums.length&&!moneyLines[i+1]?.length)return;
  const fiscal=/BASE IMPONIBLE|\bCUOTA\b|\bIVA\b|DESGLOSE|IMPUESTOS|RETENCION/.test(u);
  const isRefund=/CAMBIO|DEVOLUC|ENTREGADO|RECIBIDO|PUNTOS|AHORRO|DESCUENTO|IMPORTE DEVUELTO/.test(u);
  let marker=0;
  if(/\bTOTAL\s*(A\s*PAGAR|COMPRA|PAGADO|€|EUR)?\b|\bIMPORTE\s+TOTAL\b|\bA\s+PAGAR\b/.test(u))marker=160;
  else if(/\bTOTAL\b/.test(u))marker=135;
  else if(/IMPORTE\s+PAGADO|PAGO\s+TARJETA|TARJETA BANCARIA/.test(u))marker=110;
  else if(type==='justificante_tarjeta'&&/€|EUR|IMPORTE/.test(u))marker=90;
  if(!marker||fiscal||isRefund) return;
  const value=nums.length?nums[nums.length-1]:moneyLines[i+1][moneyLines[i+1].length-1];
  ranked.push({value,score:marker+(i/Math.max(1,lines.length))*15-(nums.length>2?30:0)-(nums.length?0:12),line:i});
 });
 ranked.sort((a,b)=>b.score-a.score);
 const alternative=[];
 for(const r of ranked)if(!alternative.some(x=>Math.abs(x-r.value)<.001))alternative.push(r.value);
 // No inventar el importe: si no aparece un total, exigir revisión.
 return {total:ranked.length?ranked[0].value:'',candidates:alternative.slice(0,8),labelFound:ranked.length>0};
}
function taxValues(lines){
 let tax=null,base=null;
 for(let i=0;i<lines.length;i++){
  const u=norm(lines[i]),v=moneyVals(lines[i]);
  if(/\b(CUOTA IVA|IVA\s+\d{1,2}\s*%|TOTAL IVA)\b/.test(u)&&v.length){
   if(v.length>=2&&/IVA\s+\d{1,2}\s*%/.test(u)){tax=v[v.length-1];base=v[v.length-2];}
   else tax=v[v.length-1];
  }
 }
 return {tax:tax===null?0:tax,base};
}
function items(lines){
 const begin=lines.findIndex(l=>/DESCRIPCION|DESCRIPCION\s+ARTICULO|ARTICULOS|DESCRIPCIO\b/.test(norm(l)));
 const start=begin>=0?begin+1:Math.min(3,lines.length);
 const found=[];
 for(let i=start;i<lines.length&&i<start+55;i++){
  const l=clean(lines[i]),u=norm(l);
  if(/^(TOTAL|SUBTOTAL|BASE|IVA\b|CUOTA|A PAGAR|TARJETA|EFECTIVO|CAMBIO|DEVOLU)/.test(u))break;
  if(/FECHA|FACTURA|NIF|TELEF|CIF|TICKET|GRACIAS/.test(u))continue;
  const amounts=moneyVals(l);if(!amounts.length)continue;
  const m=l.match(/(?:\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,6}[.,]\d{2})\s*(?:€|EUR)?\s*$/i);
  if(!m)continue;
  let name=clean(l.slice(0,m.index)).replace(/^\d{1,3}\s*(?:x|X)?\s+/,'');
  if(name.length<3||!/[\p{L}]/u.test(name)||/^\s*(IVA|BASE|CUOTA|IMPORTE|TOTAL|FECHA|PAGO)/i.test(name))continue;
  found.push({name,amounts,price:amounts[amounts.length-1]});
 }
 return found.slice(0,40);
}
function paymentFrom(text){
 const u=norm(text);
 if(/VISA|MASTER\s*CARD|MAESTRO|TARJETA|PAGO\s+TARJETA|CONTACTLESS|TPV|GETNET|REDSYS|DAT[AÁ]FONO/.test(u))return 'Tarjeta';
 if(/\bBIZUM\b/.test(u))return 'Bizum';
 if(/EFECTIVO|CONTADO|EN METALICO/.test(u))return 'Efectivo';
 return 'Otro';
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
 const date=parseDate(text),merchant=mc[0]?.name||'',concept=it.length?it.slice(0,3).map(x=>x.name).join(' + '):(type==='justificante_tarjeta'?'Pago con tarjeta':(merchant?'Compra en '+merchant:''));
 const category=mc[0]?.cat||(type==='justificante_tarjeta'?'Otros':'Otros');
 const quality=Math.max(.45,Math.min(1,Number(ocrConf||0)/90));
 const confidence={
  merchant:merchant?Math.round((mc[0]?.score||65)*quality):0,
  date:date?Math.round(94*quality):0,
  amount:tot.labelFound?Math.round(95*quality):0,
  tax:tx.tax>0?Math.round(70*quality):0,
  concept:it.length?Math.round(85*quality):(type==='justificante_tarjeta'?Math.round(72*quality):35)
 };
 const overall=Math.round((confidence.merchant+confidence.date+confidence.amount+confidence.concept+Math.max(0,Number(ocrConf||0)))/5);
 const flags=[];
 if(type==='justificante_tarjeta')flags.push('Justificante de pago: no equivale a una factura desglosada.');
 if(mc.filter(x=>x.verified).length>1)flags.push('Se detectan varios comercios: comprueba que el recorte contiene un solo ticket.');
 if(!date)flags.push('Fecha no verificada: introduce la fecha del ticket.');
 if(tot.total==='')flags.push('Importe total no verificado: introdúcelo manualmente.');
 if(!merchant)flags.push('Comercio no verificado.');
 if(type==='ticket'&&!it.length)flags.push('No se han reconocido productos individuales.');
 return {merchant,date,amount:tot.total,tax:tx.tax,base:tx.base,concept,category,payment:paymentFrom(text),
  taxId:taxId(text),invoiceNo:invoice(text),items:it,merchantCandidates:mc,amountCandidates:tot.candidates,
  confidence,overall,lines,documentType:type,flags};
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
