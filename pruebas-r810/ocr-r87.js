(()=>{
'use strict';
/* R8.10: reconocimiento OCR por zonas, conserva el original y controla memoria del móvil. */
const MAX_PIXELS=2400000;
const segment={
 cabecera:[0,.40],centro:[.28,.73],pie:[.58,1],completo:[0,1]
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function makeCanvas(image,mode='natural',section='completo'){
 const range=segment[section]||segment.completo;
 const y=Math.floor(image.height*range[0]);
 const h=Math.max(1,Math.ceil(image.height*range[1])-y),w=image.width;
 // Región corta: mayor magnificación útil, sin reducir excesivamente el largo.
 const scale=Math.min(3.5,1450/w,3500/h,Math.sqrt(MAX_PIXELS*.97/(w*h)));
 const c=document.createElement('canvas');
 c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
 const ctx=c.getContext('2d',{willReadFrequently:mode!=='natural'});
 if(!ctx)throw Error('No se pudo crear el lienzo OCR.');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
 ctx.drawImage(image,0,y,w,h,0,0,c.width,c.height);
 if(mode==='natural')return c;
 const pixels=ctx.getImageData(0,0,c.width,c.height),d=pixels.data;
 // Contraste MODERADO. La versión anterior recortaba los extremos
 // y destruía letras muy finas de los tickets térmicos.
 for(let i=0;i<d.length;i+=4){
  const g=.299*d[i]+.587*d[i+1]+.114*d[i+2];
  let v=mode==='suave'? (g-128)*1.12+134:(g-128)*1.28+134;
  v=clamp(v,0,255);
  d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;
 }
 ctx.putImageData(pixels,0,0);
 return c;
}
function fieldScore(r,key){
 const f=r.fields||{},v=f[key];
 if(v==null||v===''||(key==='payment'&&v==='Otro')||(key==='tax'&&Number(v)===0))return -9999;
 let s=Number(r.confidence||0)*.25;
 const local=f.confidence?.[key];if(Number.isFinite(local))s+=local*.65;
 if(key==='merchant'){
  const item=(f.merchantCandidates||[]).find(x=>x.name===v);
  if(item?.verified)s+=40;
  if(r.label.includes('cabecera'))s+=15;
 }
 if(key==='date'&&r.label.includes('cabecera'))s+=7;
 if(key==='amount'){
  const p=String(f.totalSource||'');
  if(/importe abonado|total compra|a pagar/.test(p))s+=45;
  else if(/total del ticket/.test(p))s+=30;
  else if(/cuadre fiscal/.test(p))s+=19;
  if(f.fiscalValidated)s+=15;
  if(r.label.includes('pie')||r.label.includes('centro'))s+=6;
 }
 if(key==='payment'&&r.label.includes('pie'))s+=8;
 if(key==='tax'&&f.fiscalValidated)s+=18;
 return s;
}
function hasRealMerchant(f){
 const m=(f.merchantCandidates||[]).find(x=>x.name===f.merchant);
 return Boolean(m&&m.verified);
}
function merge(readings){
 if(!readings.length)throw Error('No hay lecturas OCR que combinar.');
 const base=readings.slice().sort((a,b)=>b.confidence-a.confidence)[0];
 const f=JSON.parse(JSON.stringify(base.fields));
 const evidence={},warnings=[];
 const keys=['merchant','date','amount','tax','payment','concept','taxId','invoiceNo'];
 for(const k of keys){
  const options=readings.filter(x=>fieldScore(x,k)>-9000);
  if(!options.length)continue;
  const evidenceScore=x=>{
   let s=fieldScore(x,k);
   if(k==='merchant'&&!hasRealMerchant(x.fields))s-=45;
   const occurrences=options.filter(y=>String(y.fields[k])===String(x.fields[k])).length;
   return s+Math.min(24,occurrences*8);
  };
  options.sort((a,b)=>evidenceScore(b)-evidenceScore(a));
  const winner=options[0],v=winner.fields[k];
  if(k==='merchant'&&!hasRealMerchant(winner.fields)){
   // Nunca inventar "VENTA CONTADO" o un fragmento aleatorio como comercio.
   f.merchant='';f.category='Otros';evidence[k]='No verificado';continue;
  }
  f[k]=v;evidence[k]=winner.label;
  if(k==='merchant')f.category=winner.fields.category||'Otros';
  if(k==='tax'&&winner.fields.base!=null){f.base=winner.fields.base;f.fiscalValidated=winner.fields.fiscalValidated}
  if(k==='amount'){f.totalSource=winner.fields.totalSource;f.fiscalValidated=winner.fields.fiscalValidated}
  if(f.confidence&&Number.isFinite(winner.fields.confidence?.[k]))f.confidence[k]=winner.fields.confidence[k];
  const uniq=new Set(options.map(x=>String(x.fields[k])));
  if(uniq.size>1&&['amount','date','payment'].includes(k))warnings.push('Las lecturas discrepan en '+({amount:'el total',date:'la fecha',payment:'la forma de pago'}[k])+'. Revisa el documento.');
 }
 const mc=new Map(),amounts=new Set();
 for(const r of readings){
  for(const m of r.fields.merchantCandidates||[])if(m.verified)mc.set(m.name,m);
  for(const n of r.fields.amountCandidates||[])if(Number.isFinite(n))amounts.add(n);
 }
 f.merchantCandidates=[...mc.values()];
 f.amountCandidates=[...amounts];
 const products=readings.filter(x=>x.fields.items?.length).sort((a,b)=>b.fields.items.length-a.fields.items.length);
 f.items=products[0]?.fields.items||[];
 if(f.items.length&&(!f.concept||/^Compra en /.test(f.concept)))f.concept=f.items.slice(0,3).map(x=>x.name).join(' + ');
 else if(f.merchant&&(!f.concept||/^Compra en /.test(f.concept)))f.concept='Compra en '+f.merchant;
 else if(!f.merchant&&/^Compra en /.test(f.concept||''))f.concept='';
 f.flags=warnings.concat(readings.some(x=>x.fields.documentType==='justificante_tarjeta')?['Puede tratarse de un justificante bancario, no de factura.']:[]);
 if(!f.merchant)f.flags.push('Empresa no reconocida con seguridad; debe confirmarse.');
 if(!f.date)f.flags.push('Fecha no reconocida.');
 if(f.amount==null||f.amount==='')f.flags.push('Importe total no reconocido; no se utilizarán descuentos como total.');
 if(f.payment==='Otro')f.flags.push('Forma de pago sin identificar.');
 if(!f.items.length)f.flags.push('No se han podido desglosar los productos.');
 f.overall=Math.round(readings.reduce((n,r)=>n+Math.max(0,r.confidence),0)/readings.length);
 return {fields:f,evidence};
}
async function run(image,extract,known=[],notify=()=>{}){
 if(!image?.width||!image?.height)throw Error('La imagen corregida no tiene tamaño válido.');
 const diagnostics={version:'R8.10',image:[image.width,image.height],passes:[],issues:[],evidence:{}};
 let worker=null;const readings=[];
 const progress=(v,s,d)=>notify(Math.min(98,v),s,d);
 try{
  if(typeof Tesseract==='undefined'||!Tesseract.createWorker)throw Error('El motor Tesseract no se cargó; comprueba la conexión.');
  progress(20,'Preparando lectura','El ticket se leerá por zonas, con escala propia');
  worker=await Tesseract.createWorker(['spa','eng'],Tesseract.OEM?.LSTM_ONLY||1);
  const specs=[
   ['cabecera','natural','cabecera','6'],
   ['centro','natural','centro','6'],
   ['pie','natural','pie','6'],
   ['cabecera suave','suave','cabecera','6'],
   ['pie suave','suave','pie','6'],
   ['completo','natural','completo','11'],
   ['centro suave','suave','centro','11']
  ];
  for(let i=0;i<specs.length;i++){
   const [label,mode,section,psm]=specs[i];
   if(i>=5&&readings.length){
    const m=merge(readings).fields;
    // Terminamos antes si el ticket ya está completo y los resultados son consistentes.
    if(m.merchant&&m.date&&m.amount!==''&&m.payment!=='Otro'&&m.items.length)break;
   }
   let c=null;
   try{
    c=makeCanvas(image,mode,section);
    progress(24+i*10,'Leyendo '+label+'…',c.width+' × '+c.height+' píxeles');
    await worker.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1',user_defined_dpi:'300'});
    const rr=await worker.recognize(c);
    const content=String(rr?.data?.text||'').trim(),conf=Number(rr?.data?.confidence||0);
    const fields=extract(content,conf,known);
    readings.push({label,text:content,confidence:conf,fields});
    diagnostics.passes.push({label,width:c.width,height:c.height,characters:content.length,
     confidence:Math.round(conf),merchant:fields.merchant,date:fields.date,amount:fields.amount,payment:fields.payment,
     text:content});
   }catch(e){diagnostics.issues.push(label+': '+String(e?.message||e));}
   finally{if(c){c.width=1;c.height=1}}
  }
  if(!readings.length)throw Error('No se pudo completar ninguna lectura: '+diagnostics.issues.join(' | '));
  const combined=merge(readings);diagnostics.evidence=combined.evidence;
  diagnostics.totalCharacters=readings.reduce((s,r)=>s+r.text.length,0);
  if(diagnostics.issues.length)combined.fields.flags.push('Algunas zonas no pudieron analizarse.');
  if(!diagnostics.totalCharacters)combined.fields.flags.push('El OCR no ha reconocido caracteres; revisa la fotografía original.');
  const report=readings.map(r=>'=== '+r.label+' ('+Math.round(r.confidence)+'%) ===\n'+r.text).join('\n\n');
  progress(98,'Lectura completada','Comprobar campos antes de guardar');
  return {fields:combined.fields,text:report,confidence:combined.fields.overall,diagnostics};
 }finally{if(worker)try{await worker.terminate()}catch(e){console.warn('No se pudo cerrar Tesseract',e)}}
}
window.Gasto360OCRR810={run,makeCanvas,merge,hasRealMerchant};
})();