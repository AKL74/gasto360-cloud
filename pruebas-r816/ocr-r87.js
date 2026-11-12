(()=>{
'use strict';
/* Gasto360 R8.15: motor OCR restaurado exactamente de R8.7; fusión de campos corregida. Sin APIs ni envíos de tickets. */
const clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
function makeCanvas(image,mode='original',section='full'){
  const x=0,y=section==='cabecera'?0:section==='pie'?Math.floor(image.height*.45):0;
  const w=image.width,h=section==='cabecera'?Math.ceil(image.height*.48):section==='pie'?image.height-y:image.height;
  const scale=Math.min(3.2,4000/Math.max(w,h),Math.sqrt(6500000/Math.max(1,w*h)));
  const c=document.createElement('canvas');
  c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
  ctx.drawImage(image,x,y,w,h,0,0,c.width,c.height);
  if(mode==='original')return c;
  const im=ctx.getImageData(0,0,c.width,c.height),px=im.data,hist=new Uint32Array(256);
  for(let i=0;i<px.length;i+=4)hist[Math.round(.299*px[i]+.587*px[i+1]+.114*px[i+2])]++;
  const total=c.width*c.height,point=(pct)=>{let t=0;for(let i=0;i<256;i++){t+=hist[i];if(t>=total*pct)return i}return 255};
  const lo=point(.025),hi=Math.max(point(.975),lo+45),stretch=255/(hi-lo);
  for(let i=0;i<px.length;i+=4){
    let gray=.299*px[i]+.587*px[i+1]+.114*px[i+2];
    gray=clamp((gray-lo)*stretch,0,255);
    // Las letras de una impresora térmica suelen ser muy finas.
    if(mode==='binario')gray=gray<171?0:255;
    px[i]=px[i+1]=px[i+2]=gray;px[i+3]=255;
  }
  ctx.putImageData(im,0,0);
  return c;
}
function hasCritical(f){return !!(f?.merchant&&f?.date&&f?.amount!==''&&Number(f?.amount)>0)}
function textScore(r){
 const f=r.fields||{},c=f.confidence||{};
 return (r.text.length>=30?8:0)+Math.min(r.text.length/50,20)+(f.merchant?c.merchant/3:0)+(f.date?c.date/3:0)+(f.amount!==''?c.amount/3:0)+(f.payment!=='Otro'?12:0)+(f.items?.length?7:0);
}
function combine(attempts){
 const best=attempts.slice().sort((a,b)=>textScore(b)-textScore(a))[0];
 const result=(typeof structuredClone==="function")?structuredClone(best.fields):JSON.parse(JSON.stringify(best.fields));
 const choices=['merchant','date','amount','payment','tax','concept','taxId','invoiceNo'];
 const evidence={},flags=new Set(result.flags||[]);
 for(const key of choices){
  const options=attempts.filter(r=>{
    const v=r.fields[key];return v!==undefined&&v!==null&&v!==''&&(key!=='payment'||v!=='Otro')&&(key!=='tax'||Number(v)>0);
  }).map(r=>({value:r.fields[key],label:r.label,confidence:r.fields.confidence?.[key]||0,quality:r.confidence,source:r.fields.totalSource||'',fiscal:!!r.fields.fiscalValidated,base:r.fields.base??null,verified:(r.fields.merchantCandidates||[]).some(x=>x.name===r.fields.merchant&&x.verified)}));
  if(!options.length)continue;
  const counts=new Map();
  for(const x of options){const k=String(x.value).toUpperCase().trim();counts.set(k,(counts.get(k)||0)+1)}
  options.sort((a,b)=>{
   const same=(v)=>counts.get(String(v.value).toUpperCase().trim())||0;
   const region=(x)=>((key==='merchant'||key==='date')&&x.label==='cabecera'?7:key==='amount'&&x.label==='pie'?7:0);
   const evidence=x=>key==='amount'?
     (/importe abonado|total compra|a pagar/.test(x.source)?55:/total del ticket/.test(x.source)?27:/cuadre fiscal/.test(x.source)?15:0)+(x.fiscal?15:0)
     :key==='merchant'?(x.verified?35:-70):0;
   return (same(b)*9+b.confidence*.65+b.quality*.18+region(b)+evidence(b))-(same(a)*9+a.confidence*.65+a.quality*.18+region(a)+evidence(a));
  });
  const choice=options[0];
  if(key==='merchant'&&!choice.verified){result.merchant='';result.category='Otros';evidence[key]='No verificado';continue}
  result[key]=choice.value;evidence[key]=choice.label;
  if(key==='amount'){result.totalSource=choice.source;result.fiscalValidated=choice.fiscal}
  if(key==='tax'&&choice.base!==null){result.base=choice.base;result.fiscalValidated=choice.fiscal}
  if(key==='merchant'){
   const source=attempts.find(r=>r.label===choice.label);
   if(source?.fields.category&&source.fields.category!=='Otros')result.category=source.fields.category;
  }
  if(result.confidence&&key in result.confidence)result.confidence[key]=Math.min(96,Math.round(choice.confidence));
  const different=new Set(options.map(x=>String(x.value).toUpperCase().trim()));
  if(different.size>1&&(key==='amount'||key==='date'||key==='payment')){
    if(key==='amount'){
      result.amountCandidates=[...new Set(options.map(x=>x.value)),...(result.amountCandidates||[])].slice(0,8);
      flags.add('Hay varios importes reconocidos entre las lecturas: comprueba el TOTAL.');
    }else flags.add('Las lecturas no coinciden en '+(key==='date'?'la fecha':'la forma de pago')+'. Confírmala.');
  }
 }
 const allAmountCandidates=new Set();
 for(const r of attempts)for(const n of r.fields.amountCandidates||[])allAmountCandidates.add(n);
 result.amountCandidates=[...new Set([...(result.amountCandidates||[]),...allAmountCandidates])].slice(0,8);
 const allMerchants=new Map();
 for(const r of attempts)for(const m of r.fields.merchantCandidates||[])if(m?.name&&m.verified&&!allMerchants.has(m.name))allMerchants.set(m.name,m);
 result.merchantCandidates=[...allMerchants.values()].slice(0,7);
 const products=attempts.filter(r=>r.fields.items?.length).sort((a,b)=>b.fields.items.length-a.fields.items.length);
 if(products.length)result.items=products[0].fields.items;
 if(!result.concept&&result.items?.length)result.concept=result.items.slice(0,3).map(x=>x.name).join(' + ');
 if(result.merchant&&/^Compra en /i.test(result.concept||''))result.concept='Compra en '+result.merchant;
 if(!result.merchant&&/^Compra en /i.test(result.concept||''))result.concept='';
 if(result.merchant)for(const f of [...flags])if(/Comercio no verificado|varios comercios/.test(f)&&!result.merchantCandidates?.length)flags.delete(f);
 if(result.date)for(const f of [...flags])if(/Fecha no verificada/.test(f))flags.delete(f);
 if(result.amount!=='')for(const f of [...flags])if(/Importe total no verificado/.test(f))flags.delete(f);
 if(result.items?.length)for(const f of [...flags])if(/No se han reconocido productos/.test(f))flags.delete(f);
 if(!result.merchant)flags.add('No se ha podido leer el establecimiento.');
 if(!result.date)flags.add('No se ha podido leer la fecha.');
 if(result.amount==='')flags.add('No se ha podido leer el importe TOTAL.');
 if(result.payment==='Otro')flags.add('No se ha identificado con seguridad la forma de pago.');
 result.flags=[...flags];
 result.overall=Math.round(((result.confidence?.merchant||0)+(result.confidence?.date||0)+(result.confidence?.amount||0)+Math.max(...attempts.map(x=>x.confidence)))/4);
 return {fields:result,primary:best,evidence};
}
async function createWorker(log){
 if(!window.Tesseract)throw Error('El motor Tesseract no se ha cargado. Comprueba la conexión a Internet.');
 return await Tesseract.createWorker(['spa','eng'],Tesseract.OEM?.LSTM_ONLY||1,{logger:log});
}
async function recognize(worker,image,label,psm,onProgress,progressStart,progressSpan){
 await worker.setParameters({tessedit_pageseg_mode:String(psm),preserve_interword_spaces:'1',user_defined_dpi:'300'});
 onProgress(progressStart,'Leyendo '+label+'…','OCR en español e inglés');
 const r=await worker.recognize(image);
 const text=String(r.data?.text||'').trim(),confidence=Number(r.data?.confidence||0);
 onProgress(progressStart+progressSpan,'Lectura '+label+' finalizada',text.length+' caracteres');
 return {label,text,confidence};
}
async function run(image,extract,known,onProgress){
 if(!image?.width||!image?.height)throw Error('El recorte está vacío.');
 const attempts=[],diagnostics={version:'R8.15',width:image.width,height:image.height,passes:[],issues:[]};
 let activeProgress=0,worker;
 function progress(v,t,d){activeProgress=Math.max(activeProgress,v);onProgress?.(activeProgress,t,d)}
 try{
  progress(23,'Preparando reconocimiento','Cargando el motor OCR');
  worker=await createWorker(m=>{
   if(m?.status==='recognizing text'&&Number.isFinite(m.progress)){
    progress(Math.min(96,activeProgress+Math.max(0,m.progress)*2),'Reconociendo texto',Math.round(m.progress*100)+' % de la lectura actual');
   }
  });
  const specs=[
   ['original','original','full',Tesseract.PSM?.SINGLE_BLOCK||'6'],
   ['contraste','contraste','full',Tesseract.PSM?.SINGLE_BLOCK||'6'],
   ['cabecera','contraste','cabecera',Tesseract.PSM?.SPARSE_TEXT||'11'],
   ['pie','contraste','pie',Tesseract.PSM?.SPARSE_TEXT||'11'],
   ['binario','binario','full',Tesseract.PSM?.SPARSE_TEXT||'11']
  ];
  for(let i=0;i<specs.length;i++){
   const [name,mode,region,psm]=specs[i];
   // R8.15: ejecutar SIEMPRE cabecera y pie. El desglose necesita sus importes
   // aunque ya estén reconocidos comercio, fecha, total y forma de pago.
   // La lectura binaria opcional conserva su parada temprana.
   if(i===4){
    const interim=combine(attempts);
    if(hasCritical(interim.fields)&&interim.fields.payment!=='Otro')break;
   }
   let c;
   try{
    c=makeCanvas(image,mode,region);
    const r=await recognize(worker,c,name,psm,progress,28+i*14,10);
    r.fields=extract(r.text,r.confidence,known);
    attempts.push(r);
    diagnostics.passes.push({label:r.label,characters:r.text.length,confidence:Math.round(r.confidence),
      merchant:r.fields.merchant||'',date:r.fields.date||'',amount:r.fields.amount,payment:r.fields.payment,
      text:r.text});
   }catch(e){
    diagnostics.issues.push(name+': '+String(e.message||e));
    if(!attempts.length&&i>=1)throw e;
   }finally{
    if(c){c.width=1;c.height=1}
   }
  }
  if(!attempts.length)throw Error('No se ha podido ejecutar ninguna lectura OCR.');
  const merged=combine(attempts);
  const all=attempts.map(r=>'=== '+r.label.toUpperCase()+' | '+Math.round(r.confidence)+'% ===\n'+(r.text||'[sin texto]')).join('\n\n');
  diagnostics.evidence=merged.evidence;
  diagnostics.empty=attempts.every(x=>x.text.length<8);
  diagnostics.totalCharacters=attempts.reduce((n,x)=>n+x.text.length,0);
  if(diagnostics.empty)merged.fields.flags.push('El OCR no ha reconocido caracteres legibles. Repite la fotografía con más luz y mayor tamaño de texto.');
  progress(98,'Lectura completada','Revisa los datos antes de guardar');
  return {fields:merged.fields,text:all,confidence:Math.round(Math.max(...attempts.map(r=>r.confidence))),diagnostics};
 }finally{if(worker){try{await worker.terminate()}catch{}}}
}
window.Gasto360OCRR815={makeCanvas,run,combine};
})();
