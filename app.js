(()=>{
const GASTO360_R8_3=true;
const cfg=window.GASTO360_CONFIG||{};
const CLOUD_URL="https://akl74.github.io/gasto360-cloud/";
const BUCKET="gasto360-documents";
const $=id=>document.getElementById(id);

let sb=null,session=null,pendingScan=null,currentExpenses=[],currentDocs=[],currentDocGroup=null;
let submissionId=null,isSaving=false,forceDuplicateOnce=false,refreshTimer=null;

const views=["dashboardView","expenseView","expenseDetailView","scannerView","documentsView","documentDetailView","duplicatesView"];

function visible(id,on){const el=$(id);if(!el)return;el.hidden=!on;el.style.display=on?"":"none"}
function showView(id){views.forEach(x=>visible(x,x===id));window.scrollTo({top:0,behavior:"smooth"})}
function esc(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function norm(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim()}
function money(n){return Number(n||0).toLocaleString("es-ES",{style:"currency",currency:"EUR"})}
function uuid(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}
function toast(msg,type="ok",ms=3600){const el=document.createElement("div");el.className=`toast ${type}`;el.textContent=msg;$("toastHost").appendChild(el);setTimeout(()=>el.remove(),ms)}
function cleanAuthUrl(){const u=new URL(location.href);if(u.searchParams.has("code")||u.searchParams.has("error")||location.hash)history.replaceState({},document.title,CLOUD_URL)}
function authError(msg){visible("login",false);visible("app",false);visible("authError",true);$("authErrorText").textContent=msg}

async function init(){
  if(!cfg.supabaseUrl||cfg.supabaseUrl.includes("TU-PROYECTO")||!cfg.supabaseAnonKey){visible("setup",true);return}
  sb=supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{flowType:"pkce",detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
  const u=new URL(location.href),code=u.searchParams.get("code"),oauthError=u.searchParams.get("error_description")||u.searchParams.get("error");
  if(oauthError){authError(decodeURIComponent(oauthError));return}
  if(code){const ex=await sb.auth.exchangeCodeForSession(code);if(ex.error){authError("No se pudo completar la sesion: "+ex.error.message);return}cleanAuthUrl()}
  const r=await sb.auth.getSession();if(r.error){authError("No se pudo leer la sesion: "+r.error.message);return}
  session=r.data.session;renderAuth();
  sb.auth.onAuthStateChange((_e,s)=>{session=s;renderAuth()})
}

function renderAuth(){
  const logged=!!session;
  visible("authError",false);visible("login",!logged);visible("app",logged);
  ["logout","homeBtn","docsBtn"].forEach(id=>visible(id,logged));visible("signedAs",logged);
  if(logged){$("signedAs").textContent=session.user.email||"Sesion activa";showView("dashboardView");refreshAll();cleanAuthUrl()}
}

$("google").onclick=async()=>{const r=await sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:CLOUD_URL}});if(r.error)authError("No se pudo iniciar Google: "+r.error.message)};
$("retryAuth").onclick=()=>location.href=CLOUD_URL;
$("logout").onclick=async()=>{if(sb)await sb.auth.signOut();location.href=CLOUD_URL};
$("homeBtn").onclick=()=>{showView("dashboardView");refreshAll()};
$("docsBtn").onclick=()=>openDocuments();
document.querySelectorAll(".backHomeBtn").forEach(b=>b.onclick=()=>{showView("dashboardView");refreshAll()});
$("backDocuments").onclick=()=>openDocuments();
$("scanBtn").onclick=()=>showView("scannerView");
$("expenseBtn").onclick=()=>{resetExpenseForm();showView("expenseView")};
$("refreshBtn").onclick=()=>refreshAll();
$("docsMetric").onclick=()=>openDocuments();
$("duplicatesMetric").onclick=()=>openDuplicates();

function setDataStatus(msg,isError=false){
  clearTimeout(refreshTimer);
  if(!msg){visible("dataStatus",false);return}
  $("dataStatus").textContent=msg;$("dataStatus").className="data-status"+(isError?" error":"");visible("dataStatus",true);
  if(isError)refreshTimer=setTimeout(()=>visible("dataStatus",false),5000)
}
function setDocumentsStatus(msg,isError=false){if(!msg){visible("documentsStatus",false);return}$("documentsStatus").textContent=msg;$("documentsStatus").className="data-status"+(isError?" error":"");visible("documentsStatus",true)}

async function refreshAll(){
  if(!session)return;
  const btn=$("refreshBtn");btn.disabled=true;btn.textContent="Actualizando...";
  setDataStatus("Actualizando datos...");
  try{
    await Promise.all([loadExpenses(),loadDocuments(false)]);
    renderDashboard();
    setDataStatus("");
  }catch(err){
    console.error(err);setDataStatus("No se pudieron actualizar todos los datos. Intenta de nuevo.",true);toast("Error al actualizar datos: "+err.message,"error")
  }finally{
    btn.disabled=false;btn.textContent="Actualizar"
  }
}

async function loadExpenses(){
  const now=new Date(),period=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const {data,error}=await sb.from("expenses").select("*").gte("date",period+"-01").order("created_at",{ascending:false});
  if(error)throw error;
  currentExpenses=data||[];
  return currentExpenses
}
async function loadDocuments(render=true){
  const {data,error}=await sb.from("documents").select("*").order("created_at",{ascending:false});
  if(error)throw error;
  currentDocs=data||[];
  if(render)renderDocuments();
  return currentDocs
}
function findDuplicateGroups(rows=currentExpenses){
  const map=new Map();
  for(const x of rows){
    const key=[x.date,Number(x.amount||0).toFixed(2),norm(x.merchant)].join("|");
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(x)
  }
  return [...map.values()].filter(g=>g.length>1)
}
function renderDashboard(){
  const total=currentExpenses.reduce((a,x)=>a+Number(x.amount||0),0);
  $("month-total").textContent=money(total);$("month-count").textContent=String(currentExpenses.length);
  $("docs-count").textContent=String(new Set(currentDocs.map(d=>d.expense_id).filter(Boolean)).size);
  const pending=currentDocs.filter(d=>d.upload_status!=="stored").length;
  $("pending-docs-text").textContent=`${pending} pendiente${pending===1?"":"s"}`;
  $("duplicate-count").textContent=String(findDuplicateGroups().length);
  $("expenses").innerHTML=currentExpenses.length?currentExpenses.slice(0,40).map(x=>{
    const docs=currentDocs.filter(d=>d.expense_id===x.id);
    const badge=docs.length?`<span class="badge ${docs.some(d=>d.upload_status!=="stored")?"pending":"ok"}">${docs.length} doc.</span>`:"";
    return `<div class="expense-row">
      <div><b>${esc(x.merchant)}</b><br><small>${esc(x.date)} &middot; ${esc(x.category||"Otros")} ${badge}</small></div>
      <strong>${money(x.amount)}</strong>
      <div class="expense-actions"><button class="mini-btn expense-review" data-id="${x.id}">Revisar</button>${docs.length?`<button class="mini-btn expense-docs" data-id="${x.id}">Docs</button>`:""}</div>
    </div>`}).join(""):'<div class="empty">Todav&iacute;a no hay gastos este mes.</div>';
}
$("expenses").addEventListener("click",e=>{
  const r=e.target.closest(".expense-review"),d=e.target.closest(".expense-docs");
  if(r)openExpenseDetail(r.dataset.id);
  if(d)openDocumentGroup(d.dataset.id)
});

function resetExpenseForm(){
  submissionId=uuid();forceDuplicateOnce=false;isSaving=false;
  $("date").value=new Date().toISOString().slice(0,10);
  ["merchant","concept","amount","notes"].forEach(x=>$(x).value="");$("tax").value="0";
  $("saveExpenseBtn").disabled=false;$("saveExpenseBtn").textContent="Guardar gasto";
  visible("duplicateWarning",false);
  renderPendingScan()
}
function renderPendingScan(){
  visible("scanAttached",!!pendingScan);
  if(pendingScan)$("scanAttachedName").textContent=pendingScan.original?.name||"Ticket escaneado"
}
$("removeScan").onclick=()=>{pendingScan=null;renderPendingScan();toast("Documento retirado del gasto","warn")};

function expenseFromForm(){
  return {owner_id:session.user.id,submission_id:submissionId,source:pendingScan?"scanner":"manual",
    date:$("date").value,merchant:$("merchant").value.trim(),concept:$("concept").value.trim(),category:$("category").value,
    amount:Number($("amount").value),tax:Number($("tax").value||0),payment_method:$("payment").value,scope:$("scope").value,notes:$("notes").value.trim()}
}
async function findSimilar(expense){
  const {data,error}=await sb.from("expenses").select("*").eq("date",expense.date).eq("amount",expense.amount).limit(20);
  if(error)throw error;
  return (data||[]).filter(x=>norm(x.merchant)===norm(expense.merchant)&&norm(x.concept||"")===norm(expense.concept||""))
}
$("expenseForm").onsubmit=async e=>{
  e.preventDefault();if(!session||isSaving)return;
  const expense=expenseFromForm();
  if(!expense.merchant||!expense.date||!Number.isFinite(expense.amount)){toast("Completa comercio, fecha e importe.","warn");return}
  if(!forceDuplicateOnce){
    try{
      const similar=await findSimilar(expense);
      if(similar.length){
        $("duplicateExisting").innerHTML=similar.map(x=>`<div><b>${esc(x.merchant)}</b> &middot; ${esc(x.date)} &middot; ${money(x.amount)}</div>`).join("");
        visible("duplicateWarning",true);$("duplicateWarning").scrollIntoView({behavior:"smooth",block:"center"});return
      }
    }catch(err){toast("No se pudo comprobar duplicados: "+err.message,"warn")}
  }
  await saveExpense(expense)
};
$("cancelDuplicate").onclick=()=>{visible("duplicateWarning",false);forceDuplicateOnce=false};
$("forceDuplicate").onclick=async()=>{visible("duplicateWarning",false);forceDuplicateOnce=true;await saveExpense(expenseFromForm())};

async function saveExpense(expense){
  isSaving=true;const btn=$("saveExpenseBtn");btn.disabled=true;btn.textContent="Guardando...";
  try{
    let data,error;
    ({data,error}=await sb.from("expenses").insert(expense).select().single());
    if(error && String(error.message||"").toLowerCase().includes("duplicate")){
      const r=await sb.from("expenses").select("*").eq("submission_id",submissionId).maybeSingle();
      if(r.error)throw error;data=r.data
    }else if(error)throw error;
    toast("Gasto guardado correctamente.","ok");
    if(pendingScan){
      const scan=pendingScan;pendingScan=null;renderPendingScan();
      const result=await attachScanDocuments(data.id,scan);
      if(result.pending)toast(`Gasto guardado. ${result.pending} documento(s) quedan pendientes de subida.`,"warn",6000);
      else toast("Documento guardado y vinculado al gasto.","ok")
    }
    resetExpenseForm();showView("dashboardView");await refreshAll()
  }catch(err){
    console.error(err);toast("No se pudo guardar el gasto: "+err.message,"error",6000)
  }finally{
    isSaving=false;btn.disabled=false;btn.textContent="Guardar gasto";forceDuplicateOnce=false
  }
}

async function sha256Blob(blob){
  try{const buf=await blob.arrayBuffer(),hash=await crypto.subtle.digest("SHA-256",buf);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")}catch{return null}
}
function safe(s){return String(s||"file").replace(/[^a-zA-Z0-9._-]/g,"_")}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
async function storageUploadStandard(path,blob,type){
  for(let i=0;i<3;i++){
    try{
      const r=await sb.storage.from(BUCKET).upload(path,blob,{upsert:false,contentType:type||blob.type||"application/octet-stream",cacheControl:"3600"});
      if(!r.error)return;
      if(/already exists|duplicate/i.test(r.error.message||""))return;
      if(i===2)throw r.error
    }catch(err){if(i===2)throw err;await sleep(700*(i+1))}
  }
}
async function storageUploadTus(path,blob,type){
  if(!window.tus)throw new Error("Carga reanudable no disponible");
  const projectId=new URL(cfg.supabaseUrl).hostname.split(".")[0];
  const endpoint=`https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
  return new Promise((resolve,reject)=>{
    const upload=new tus.Upload(blob,{endpoint,retryDelays:[0,1000,3000,5000],headers:{authorization:`Bearer ${session.access_token}`},
      uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,chunkSize:6*1024*1024,
      metadata:{bucketName:BUCKET,objectName:path,contentType:type||blob.type||"application/octet-stream",cacheControl:"3600"},
      onError:reject,onSuccess:resolve});
    upload.findPreviousUploads().then(prev=>{if(prev.length)upload.resumeFromPreviousUpload(prev[0]);upload.start()}).catch(()=>upload.start())
  })
}
async function uploadRobust(path,blob,type){
  if(blob.size>5*1024*1024 && window.tus){try{return await storageUploadTus(path,blob,type)}catch(e){console.warn("TUS fallo; fallback standard",e)}}
  try{return await storageUploadStandard(path,blob,type)}catch(first){
    if(window.tus)return storageUploadTus(path,blob,type);
    throw first
  }
}

function idbOpen(){return new Promise((resolve,reject)=>{const r=indexedDB.open("Gasto360PendingDocs",1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("files"))r.result.createObjectStore("files",{keyPath:"docId"})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function queueBlob(docId,blob,mime){const db=await idbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").put({docId,blob,mime,at:Date.now()});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function getQueuedBlob(docId){const db=await idbOpen();return new Promise((resolve,reject)=>{const r=db.transaction("files").objectStore("files").get(docId);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
async function deleteQueuedBlob(docId){const db=await idbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction("files","readwrite");tx.objectStore("files").delete(docId);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}

async function createAndUploadDoc(expenseId,blob,name,kind,scan){
  const path=`${session.user.id}/${expenseId}/${Date.now()}-${kind}-${safe(name)}`;
  const sha=await sha256Blob(blob);
  const meta={owner_id:session.user.id,expense_id:expenseId,storage_path:path,original_name:name,sha256:sha,doc_kind:kind,
    mime_type:blob.type||"image/jpeg",file_size:blob.size,upload_status:"pending",upload_error:null,
    ocr_text:kind==="scanner_corrected"?(scan.text||""):"",ocr_status:kind==="scanner_corrected"?(scan.text?"ocr_ok":"not_run"):"original",
    ocr_confidence:kind==="scanner_corrected"?Number(scan.confidence||0):null,ocr_fields:kind==="scanner_corrected"?(scan.fields||{}):{},review_status:"pending"};
  const ins=await sb.from("documents").insert(meta).select().single();if(ins.error)throw ins.error;
  const doc=ins.data;await queueBlob(doc.id,blob,meta.mime_type);
  try{
    await uploadRobust(path,blob,meta.mime_type);
    const up=await sb.from("documents").update({upload_status:"stored",upload_error:null,updated_at:new Date().toISOString()}).eq("id",doc.id);
    if(up.error)throw up.error;await deleteQueuedBlob(doc.id);return {stored:true,docId:doc.id}
  }catch(err){
    await sb.from("documents").update({upload_status:"pending",upload_error:String(err.message||err),updated_at:new Date().toISOString()}).eq("id",doc.id);
    return {stored:false,docId:doc.id,error:err}
  }
}
async function attachScanDocuments(expenseId,scan){
  let pending=0;
  const files=[
    [scan.original,scan.original?.name||"ticket-original.jpg","original"],
    [scan.corrected,"ticket-corregido.jpg","scanner_corrected"]
  ].filter(x=>x[0]);
  for(const [blob,name,kind] of files){const r=await createAndUploadDoc(expenseId,blob,name,kind,scan);if(!r.stored)pending++}
  return {pending}
}

async function openExpenseDetail(id){
  const x=currentExpenses.find(e=>e.id===id)||(await sb.from("expenses").select("*").eq("id",id).single()).data;
  if(!x)return;
  $("editExpenseId").value=x.id;$("editDate").value=x.date;$("editMerchant").value=x.merchant||"";$("editConcept").value=x.concept||"";
  $("editCategory").value=x.category||"";$("editAmount").value=x.amount??"";$("editTax").value=x.tax??0;$("editPayment").value=x.payment_method||"";
  $("editScope").value=x.scope||"";$("editNotes").value=x.notes||"";showView("expenseDetailView")
}
$("expenseEditForm").onsubmit=async e=>{
  e.preventDefault();const id=$("editExpenseId").value;
  const patch={date:$("editDate").value,merchant:$("editMerchant").value.trim(),concept:$("editConcept").value.trim(),category:$("editCategory").value.trim(),
    amount:Number($("editAmount").value),tax:Number($("editTax").value||0),payment_method:$("editPayment").value.trim(),scope:$("editScope").value.trim(),notes:$("editNotes").value.trim(),updated_at:new Date().toISOString()};
  const r=await sb.from("expenses").update(patch).eq("id",id);if(r.error){toast("No se pudo corregir: "+r.error.message,"error");return}
  await sb.from("documents").update({review_status:"reviewed",updated_at:new Date().toISOString()}).eq("expense_id",id);
  toast("Correcciones guardadas.");showView("dashboardView");await refreshAll()
};
$("openExpenseDocs").onclick=()=>openDocumentGroup($("editExpenseId").value);
$("deleteExpenseBtn").onclick=async()=>{
  const id=$("editExpenseId").value,x=currentExpenses.find(e=>e.id===id);
  if(!confirm(`Eliminar definitivamente el gasto "${x?.merchant||""}" de ${money(x?.amount)}?`))return;
  const docs=currentDocs.filter(d=>d.expense_id===id);
  const paths=docs.filter(d=>d.upload_status==="stored").map(d=>d.storage_path);
  if(paths.length){const rem=await sb.storage.from(BUCKET).remove(paths);if(rem.error)toast("Aviso: no se pudieron borrar todos los archivos físicos.","warn")}
  for(const d of docs){try{await deleteQueuedBlob(d.id)}catch{}}
  const r=await sb.from("expenses").delete().eq("id",id);if(r.error){toast("No se pudo eliminar: "+r.error.message,"error");return}
  toast("Gasto eliminado.");showView("dashboardView");await refreshAll()
};

async function openDocuments(){
  showView("documentsView");setDocumentsStatus("Cargando documentos...");
  try{await Promise.all([loadDocuments(false),loadExpenses()]);renderDocuments();setDocumentsStatus("")}catch(err){setDocumentsStatus("No se pudieron cargar los documentos: "+err.message,true)}
}
function groupDocuments(){
  const map=new Map();for(const d of currentDocs){const k=d.expense_id||"sin-gasto";if(!map.has(k))map.set(k,[]);map.get(k).push(d)}return [...map.entries()]
}
function renderDocuments(){
  const q=norm($("documentSearch").value),expMap=new Map(currentExpenses.map(x=>[x.id,x]));
  const groups=groupDocuments().filter(([id])=>{if(!q)return true;const x=expMap.get(id);return norm([x?.merchant,x?.concept,x?.date].join(" ")).includes(q)});
  $("documentsList").innerHTML=groups.length?groups.map(([id,docs])=>{
    const x=expMap.get(id),pending=docs.filter(d=>d.upload_status!=="stored").length,ocr=docs.some(d=>d.ocr_text);
    return `<div class="doc-card">
      <div><h3>${esc(x?.merchant||"Documento sin gasto")}</h3><small>${esc(x?.date||"")} ${x?`&middot; ${money(x.amount)}`:""} &middot; ${docs.length} archivo(s)</small><div>
        <span class="badge ${pending?"pending":"ok"}">${pending?pending+" pendiente(s)":"Guardado"}</span>
        ${ocr?'<span class="badge ok">OCR</span>':""}
      </div></div>
      <button class="open-doc-group" data-id="${id}">Ver / corregir</button>
    </div>`}).join(""):'<div class="empty">No hay documentos.</div>'
}
$("documentSearch").oninput=renderDocuments;
$("documentsList").addEventListener("click",e=>{const b=e.target.closest(".open-doc-group");if(b)openDocumentGroup(b.dataset.id)});
$("retryPendingDocs").onclick=async()=>{
  const pending=currentDocs.filter(d=>d.upload_status!=="stored");if(!pending.length){toast("No hay documentos pendientes.");return}
  let ok=0,miss=0;
  for(const d of pending){const q=await getQueuedBlob(d.id);if(!q){miss++;continue}try{await uploadRobust(d.storage_path,q.blob,q.mime);const u=await sb.from("documents").update({upload_status:"stored",upload_error:null,updated_at:new Date().toISOString()}).eq("id",d.id);if(u.error)throw u.error;await deleteQueuedBlob(d.id);ok++}catch(err){await sb.from("documents").update({upload_error:String(err.message||err),updated_at:new Date().toISOString()}).eq("id",d.id)}}
  toast(`${ok} documento(s) recuperados${miss?`; ${miss} ya no están disponibles localmente`:""}.`,miss?"warn":"ok",6000);await openDocuments()
};

async function openDocumentGroup(expenseId){
  const docs=currentDocs.filter(d=>d.expense_id===expenseId);
  const x=currentExpenses.find(e=>e.id===expenseId);
  if(!docs.length){toast("No hay documentos vinculados.","warn");return}
  currentDocGroup={expense:x,docs,selected:null};showView("documentDetailView");
  $("documentDetailTitle").textContent=x?`${x.merchant} · ${money(x.amount)}`:"Documento";
  $("docMerchant").value=x?.merchant||"";$("docDate").value=x?.date||"";$("docAmount").value=x?.amount??"";$("docTax").value=x?.tax??0;$("docConcept").value=x?.concept||"";$("docCategory").value=x?.category||"";
  $("documentFileTabs").innerHTML=docs.map((d,i)=>`<button class="file-tab ${i===0?"active":""}" data-doc="${d.id}">${d.doc_kind==="original"?"Original":"Corregido"} ${d.upload_status!=="stored"?"· pendiente":""}</button>`).join("");
  await selectDocumentFile(docs.find(d=>d.doc_kind==="scanner_corrected")||docs[0])
}
$("documentFileTabs").addEventListener("click",async e=>{const b=e.target.closest(".file-tab");if(!b)return;document.querySelectorAll(".file-tab").forEach(x=>x.classList.toggle("active",x===b));const d=currentDocGroup.docs.find(x=>x.id===b.dataset.doc);if(d)await selectDocumentFile(d)});
async function selectDocumentFile(d){
  currentDocGroup.selected=d;$("documentPreview").hidden=true;$("documentPreviewMessage").hidden=false;$("downloadDocument").disabled=true;visible("retryDocument",d.upload_status!=="stored");
  $("documentOcrText").textContent=d.ocr_text||"Sin texto OCR.";
  $("documentOcrMeta").innerHTML=`<p><b>Estado:</b> ${esc(d.upload_status)}</p><p><b>Confianza OCR:</b> ${Number(d.ocr_confidence||0).toFixed(0)}%</p><p><b>Revisi&oacute;n:</b> ${esc(d.review_status||"pending")}</p>${d.upload_error?`<p><b>Error:</b> ${esc(d.upload_error)}</p>`:""}`;
  if(d.upload_status==="stored"){
    const r=await sb.storage.from(BUCKET).createSignedUrl(d.storage_path,300);
    if(r.error){$("documentPreviewMessage").textContent="No se pudo abrir: "+r.error.message;return}
    $("documentPreview").src=r.data.signedUrl;$("documentPreview").hidden=false;$("documentPreviewMessage").hidden=true;$("downloadDocument").disabled=false
  }else{
    const q=await getQueuedBlob(d.id);if(q){$("documentPreview").src=URL.createObjectURL(q.blob);$("documentPreview").hidden=false;$("documentPreviewMessage").hidden=true}else $("documentPreviewMessage").textContent="Documento pendiente y sin copia local disponible en este dispositivo."
  }
}
$("downloadDocument").onclick=async()=>{const d=currentDocGroup?.selected;if(!d||d.upload_status!=="stored")return;const r=await sb.storage.from(BUCKET).createSignedUrl(d.storage_path,60,{download:d.original_name});if(r.error){toast(r.error.message,"error");return}const a=document.createElement("a");a.href=r.data.signedUrl;a.download=d.original_name;a.click()};
$("retryDocument").onclick=async()=>{const d=currentDocGroup?.selected;if(!d)return;const q=await getQueuedBlob(d.id);if(!q){toast("La copia local ya no está disponible en este dispositivo.","warn");return}try{await uploadRobust(d.storage_path,q.blob,q.mime);const r=await sb.from("documents").update({upload_status:"stored",upload_error:null,updated_at:new Date().toISOString()}).eq("id",d.id);if(r.error)throw r.error;await deleteQueuedBlob(d.id);d.upload_status="stored";toast("Documento subido correctamente.");await selectDocumentFile(d)}catch(err){toast("Sigue pendiente: "+err.message,"error")}};
$("documentExpenseForm").onsubmit=async e=>{e.preventDefault();const x=currentDocGroup?.expense;if(!x)return;const patch={merchant:$("docMerchant").value.trim(),date:$("docDate").value,amount:Number($("docAmount").value),tax:Number($("docTax").value||0),concept:$("docConcept").value.trim(),category:$("docCategory").value.trim(),updated_at:new Date().toISOString()};const r=await sb.from("expenses").update(patch).eq("id",x.id);if(r.error){toast(r.error.message,"error");return}await sb.from("documents").update({review_status:"reviewed",updated_at:new Date().toISOString()}).eq("expense_id",x.id);toast("Datos corregidos y guardados.");await openDocuments()};

function openDuplicates(){
  const groups=findDuplicateGroups();showView("duplicatesView");
  $("duplicatesList").innerHTML=groups.length?groups.map((g,i)=>`<div class="duplicate-group"><h3>Grupo ${i+1}: ${esc(g[0].merchant)} · ${money(g[0].amount)}</h3>${g.map(x=>`<div class="duplicate-item"><div><b>${esc(x.date)}</b><br><small>${esc(x.concept||"Sin concepto")} · creado ${new Date(x.created_at).toLocaleString("es-ES")}</small></div><span>${money(x.amount)}</span><button class="mini-btn dup-review" data-id="${x.id}">Revisar</button></div>`).join("")}</div>`).join(""):'<div class="empty">No se detectan movimientos duplicados.</div>'
}
$("duplicatesList").addEventListener("click",e=>{const b=e.target.closest(".dup-review");if(b)openExpenseDetail(b.dataset.id)});

window.gasto360Cloud={
  get sb(){return sb},get session(){return session},
  setScan(scan){pendingScan=scan;renderPendingScan()},
  useScanData(fields,scan){pendingScan=scan;resetExpenseForm();pendingScan=scan;renderPendingScan();Object.entries(fields||{}).forEach(([k,v])=>{const el=$(k);if(el&&v!==undefined&&v!==null&&v!=="")el.value=v});showView("expenseView")},
  openExpense(){resetExpenseForm();showView("expenseView")},
  toast
};

init();
})();