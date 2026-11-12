(()=>{
'use strict';
/* Entorno R8.11 completamente local y efímero: jamás escribe en Supabase. */
const $=id=>document.getElementById(id);
const views=['dashboardView','expenseView','expenseDetailView','scannerView','documentsView','documentDetailView','duplicatesView'];
let results=[],selected=null,selectedKind='scanner_corrected';
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const euro=v=>Number(v||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'});
function show(id){for(const v of views){const el=$(v);if(el)el.hidden=v!==id}scrollTo({top:0,behavior:'instant'})}
function toast(message,type='ok',ms=4500){
 const e=document.createElement('div');e.className='toast '+type;e.textContent=message;$('toastHost').appendChild(e);setTimeout(()=>e.remove(),ms);
}
function goHome(){show('scannerView')}
function download(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
function exportResults(){
 const report={version:'Gasto360 R8.11 TEST',createdAt:new Date().toISOString(),note:'Resultados locales; fotografías no incluidas',cases:results.map(x=>({
    id:x.id,createdAt:x.createdAt,fields:x.fields,scannerFields:x.metadata,ocrText:x.text,
    ocrConfidence:x.ocrConfidence,originalFilename:x.original?.name||null,
    originalBytes:x.original?.size||0,correctedBytes:x.corrected?.size||0
 }))};
 download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),
 'informe_pruebas_Gasto360_R811_'+new Date().toISOString().slice(0,10)+'.json');
 toast('Informe descargado en el dispositivo; no se ha enviado a ninguna nube.');
}
function duplicates(fields){
 return results.filter(x=>String(x.fields.merchant).trim().toUpperCase()===String(fields.merchant).trim().toUpperCase()&&x.fields.date===fields.date&&Number(x.fields.amount)===Number(fields.amount));
}
async function saveScannedExpense(payload,force=false){
 const matches=duplicates(payload.fields);
 if(matches.length&&!force){return {duplicate:true,rows:matches.map(x=>({...x.fields}))}}
 const scan=payload.scan;
 results.unshift({
  id:payload.submissionId||String(Date.now()),createdAt:new Date().toISOString(),
  fields:{...payload.fields},metadata:{...scan.fields},text:scan.text,ocrConfidence:scan.confidence,
  original:scan.original,corrected:scan.corrected
 });
 return {ok:true,pending:0};
}
window.gasto360Cloud={
 toast,getKnownMerchants:async()=>['MERCADONA, S.A.','ALCAMPO JEREZ','LIDL','GRUPO DÍA','TGB The Good Burger','100 MONTADITOS','PRIMOR','ASADOR REAL','CARREFOUR','ALDI'],
 saveScannedExpense,goHome
};
function renderResults(){
 show('documentsView');
 const needle=($('documentSearch').value||'').toLocaleLowerCase('es');
 const filtered=results.filter(r=>(r.fields.merchant+' '+r.fields.date+' '+r.fields.concept).toLocaleLowerCase('es').includes(needle));
 $('documentsList').innerHTML=filtered.length?filtered.map(r=>'<article class="card" style="margin:12px 0;padding:16px"><b>'+esc(r.fields.merchant)+'</b> · '+esc(r.fields.date)+' · '+euro(r.fields.amount)+'<p style="margin:8px 0">'+esc(r.fields.concept||'Sin concepto')+'</p><button class="view-test" data-id="'+esc(r.id)+'" type="button">Ver fotos y lectura</button></article>').join(''):'<p>Sin resultados. Escanea un ticket y pulsa Guardar resultado.</p>';
}
function showFile(kind){
 if(!selected)return;
 selectedKind=kind;
 const blob=kind==='original'?selected.original:selected.corrected;
 const el=$('documentPreview');
 if(el.dataset.objecturl)URL.revokeObjectURL(el.dataset.objecturl);
 if(blob){const url=URL.createObjectURL(blob);el.src=url;el.dataset.objecturl=url;el.hidden=false;$('documentPreviewMessage').hidden=true;$('downloadDocument').disabled=false}
 else{el.hidden=true;$('documentPreviewMessage').hidden=false;$('documentPreviewMessage').textContent='No se generó esta imagen.';$('downloadDocument').disabled=true}
 document.querySelectorAll('#documentFileTabs button').forEach(b=>b.classList.toggle('active',b.dataset.kind===kind));
}
function openResult(id){
 selected=results.find(r=>r.id===id);if(!selected)return;
 show('documentDetailView');
 const f=selected.fields;
 $('documentDetailTitle').textContent=f.merchant+' · '+euro(f.amount);
 $('documentFileTabs').innerHTML='<button class="file-tab" data-kind="scanner_corrected">Corregido</button><button class="file-tab" data-kind="original">Original</button>';
 $('docMerchant').value=f.merchant||'';$('docDate').value=f.date||'';$('docAmount').value=f.amount||'';
 $('docTax').value=f.tax||0;$('docConcept').value=f.concept||'';$('docCategory').value=f.category||'';
 $('documentOcrMeta').textContent='Confianza OCR: '+Math.round(selected.ocrConfidence||0)+' %. Modo pruebas: sin base de datos externa.';
 $('documentOcrText').textContent=selected.text||'Sin texto OCR';
 $('retryDocument').hidden=true;showFile('scanner_corrected');
}
$('homeBtn').addEventListener('click',()=>{goHome();window.gasto360Scanner?.reset?.()});
$('docsBtn').addEventListener('click',renderResults);
$('scannerExit').addEventListener('click',renderResults);
$('documentSearch').addEventListener('input',renderResults);
$('documentsList').addEventListener('click',e=>{const b=e.target.closest('.view-test');if(b)openResult(b.dataset.id)});
$('documentFileTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-kind]');if(b)showFile(b.dataset.kind)});
$('backDocuments').addEventListener('click',renderResults);
$('downloadDocument').addEventListener('click',()=>{if(!selected)return;const blob=selectedKind==='original'?selected.original:selected.corrected;if(blob)download(blob,'gasto360_r811_'+selectedKind+'.jpg')});
$('documentExpenseForm').addEventListener('submit',e=>{e.preventDefault();if(!selected)return;Object.assign(selected.fields,{merchant:$('docMerchant').value,date:$('docDate').value,amount:Number($('docAmount').value),tax:Number($('docTax').value),concept:$('docConcept').value,category:$('docCategory').value});toast('Corrección guardada solo en esta pestaña.');renderResults()});
$('exportAllTests').addEventListener('click',exportResults);
document.querySelectorAll('.backHomeBtn').forEach(e=>{if(e.id!=='scannerExit')e.addEventListener('click',()=>show('scannerView'))});
show('scannerView');
toast('Prueba aislada R8.11: ningún ticket se enviará a Supabase.','ok',6500);
})();