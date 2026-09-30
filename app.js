(()=>{
const GASTO360_R8_2G=true;
const cfg=window.GASTO360_CONFIG||{};
const CLOUD_URL="https://akl74.github.io/gasto360-cloud/";
const $=id=>document.getElementById(id);
let sb=null,session=null,pendingScan=null;

function visible(id,on){
  const el=$(id); if(!el)return;
  el.hidden=!on;
  el.style.display=on?"":"none";
}
function showView(id){
  ["dashboardView","expenseView","scannerView"].forEach(x=>visible(x,x===id));
}
function authError(msg){
  visible("login",false);visible("app",false);visible("authError",true);
  $("authErrorText").textContent=msg;
}
function cleanAuthUrl(){
  const u=new URL(location.href);
  if(u.searchParams.has("code")||u.searchParams.has("error")||location.hash){
    history.replaceState({},document.title,CLOUD_URL);
  }
}
async function init(){
  if(!cfg.supabaseUrl||cfg.supabaseUrl.includes("TU-PROYECTO")||!cfg.supabaseAnonKey){
    visible("setup",true);return;
  }
  sb=supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
    auth:{
      flowType:"pkce",
      detectSessionInUrl:false,
      persistSession:true,
      autoRefreshToken:true
    }
  });

  const u=new URL(location.href);
  const authCode=u.searchParams.get("code");
  const oauthError=u.searchParams.get("error_description")||u.searchParams.get("error");
  if(oauthError){authError(decodeURIComponent(oauthError));return;}

  if(authCode){
    const ex=await sb.auth.exchangeCodeForSession(authCode);
    if(ex.error){authError("No se pudo completar la sesion: "+ex.error.message);return;}
    cleanAuthUrl();
  }

  const r=await sb.auth.getSession();
  if(r.error){authError("No se pudo leer la sesion: "+r.error.message);return;}
  session=r.data.session;
  renderAuth();

  sb.auth.onAuthStateChange((_event,s)=>{
    session=s;
    renderAuth();
  });
}
function renderAuth(){
  const logged=!!session;
  visible("authError",false);
  visible("login",!logged);
  visible("app",logged);
  visible("logout",logged);
  visible("homeBtn",logged);
  visible("signedAs",logged);
  if(logged){
    $("signedAs").textContent=session.user.email||"Sesion activa";
    showView("dashboardView");
    loadExpenses();
    cleanAuthUrl();
  }
}
$("google").onclick=async()=>{
  const r=await sb.auth.signInWithOAuth({
    provider:"google",
    options:{redirectTo:CLOUD_URL}
  });
  if(r.error)authError("No se pudo iniciar Google: "+r.error.message);
};
$("retryAuth").onclick=()=>{location.href=CLOUD_URL};
$("logout").onclick=async()=>{
  if(sb)await sb.auth.signOut();
  location.href=CLOUD_URL;
};
$("homeBtn").onclick=()=>showView("dashboardView");
document.querySelectorAll(".backBtn").forEach(b=>b.onclick=()=>showView("dashboardView"));
$("expenseBtn").onclick=()=>{resetForm();showView("expenseView")};
$("scanBtn").onclick=()=>showView("scannerView");
$("refreshBtn").onclick=loadExpenses;

function resetForm(){
  $("date").value=new Date().toISOString().slice(0,10);
  ["merchant","concept","amount","notes"].forEach(x=>$(x).value="");
  $("tax").value="0";
}
function setDataStatus(msg,isError=false){
  const el=$("dataStatus");
  if(!msg){visible("dataStatus",false);return;}
  el.textContent=msg;el.className="data-status"+(isError?" error":"");visible("dataStatus",true);
}
async function loadExpenses(){
  if(!session)return;
  setDataStatus("Actualizando datos...");
  const now=new Date();
  const period=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const {data,error}=await sb.from("expenses").select("*").gte("date",period+"-01").order("date",{ascending:false});
  if(error){
    setDataStatus("Error de datos: "+error.message,true);
    $("expenses").innerHTML="";
    return;
  }
  setDataStatus("");
  const rows=data||[];
  const total=rows.reduce((a,x)=>a+Number(x.amount||0),0);
  $("month-total").textContent=total.toLocaleString("es-ES",{style:"currency",currency:"EUR"});
  $("month-count").textContent=String(rows.length);
  $("expenses").innerHTML=rows.length
   ?rows.slice(0,30).map(x=>`<div class="expense-row"><div><b>${esc(x.merchant)}</b><br><small>${esc(x.date)} &middot; ${esc(x.category||"Otros")}</small></div><strong>${Number(x.amount||0).toLocaleString("es-ES",{style:"currency",currency:"EUR"})}</strong></div>`).join("")
   :'<div class="empty">Todavia no hay gastos este mes.</div>';
}
function esc(s){
  return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}
$("expenseForm").onsubmit=async e=>{
  e.preventDefault();if(!session)return;
  const expense={
    owner_id:session.user.id,date:$("date").value,merchant:$("merchant").value.trim(),
    concept:$("concept").value.trim(),category:$("category").value,
    amount:Number($("amount").value),tax:Number($("tax").value||0),
    payment_method:$("payment").value,scope:$("scope").value,notes:$("notes").value.trim()
  };
  const {data,error}=await sb.from("expenses").insert(expense).select().single();
  if(error){alert("No se pudo guardar: "+error.message);return;}
  if(pendingScan){try{await uploadDocument(data.id,pendingScan)}catch(err){alert("Gasto guardado, pero fallo el documento: "+err.message)}pendingScan=null;}
  showView("dashboardView");await loadExpenses();
};
async function uploadDocument(expenseId,scan){
  const base=`${session.user.id}/${expenseId}/${Date.now()}`;
  const originalPath=base+"-original-"+safe(scan.original.name),correctedPath=base+"-corrected.jpg";
  let r=await sb.storage.from("gasto360-documents").upload(originalPath,scan.original,{upsert:false,contentType:scan.original.type});
  if(r.error)throw r.error;
  r=await sb.storage.from("gasto360-documents").upload(correctedPath,scan.corrected,{upsert:false,contentType:"image/jpeg"});
  if(r.error)throw r.error;
  const d=await sb.from("documents").insert([
    {owner_id:session.user.id,expense_id:expenseId,storage_path:originalPath,original_name:scan.original.name,doc_kind:"original",ocr_text:"",ocr_status:"original"},
    {owner_id:session.user.id,expense_id:expenseId,storage_path:correctedPath,original_name:"CORREGIDO_"+scan.original.name,doc_kind:"scanner_corrected",ocr_text:scan.text||"",ocr_status:scan.text?"ocr_ok":"not_run"}
  ]);
  if(d.error)throw d.error;
}
function safe(s){return String(s||"file").replace(/[^a-zA-Z0-9._-]/g,"_")}
window.gasto360Cloud={
  get sb(){return sb},get session(){return session},
  setScan(x){pendingScan=x},openExpense(){showView("expenseView")},
  fill:(o)=>{resetForm();Object.entries(o).forEach(([k,v])=>{$(k)&&($(k).value=v??"")});showView("expenseView")}
};
init();
})();