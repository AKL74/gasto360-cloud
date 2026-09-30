(()=>{
const cfg=window.GASTO360_CONFIG||{};
const CLOUD_RETURN="https://akl74.github.io/gasto360-cloud/";
const $=id=>document.getElementById(id);
let sb=null, session=null, pendingScan=null;

const show=id=>["dashboardView","expenseView","scannerView"].forEach(x=>$(x).hidden=x!==id);

async function init(){
  if(!cfg.supabaseUrl||cfg.supabaseUrl.includes("TU-PROYECTO")){
    $("setup").hidden=false;
    return;
  }
  sb=supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
    auth:{
      detectSessionInUrl:true,
      persistSession:true,
      autoRefreshToken:true
    }
  });

  const r=await sb.auth.getSession();
  session=r.data.session;
  renderAuth();

  sb.auth.onAuthStateChange((_e,s)=>{
    session=s;
    renderAuth();
    if(s && location.hash){
      history.replaceState({},document.title,location.pathname);
    }
  });
}

function renderAuth(){
  $("login").hidden=!!session;
  $("app").hidden=!session;
  $("logout").hidden=!session;
  $("homeBtn").hidden=!session;
  if(session){
    show("dashboardView");
    loadExpenses();
  }
}

$("google").onclick=async()=>{
  const {data,error}=await sb.auth.signInWithOAuth({
    provider:"google",
    options:{ redirectTo:CLOUD_RETURN }
  });
  if(error){
    alert("No se pudo iniciar Google: "+error.message);
    return;
  }
};

$("logout").onclick=async()=>{
  await sb.auth.signOut();
  location.href=CLOUD_RETURN;
};
$("homeBtn").onclick=()=>show("dashboardView");
document.querySelectorAll(".backBtn").forEach(b=>b.onclick=()=>show("dashboardView"));
$("expenseBtn").onclick=()=>{resetForm();show("expenseView");};
$("scanBtn").onclick=()=>show("scannerView");
$("refreshBtn").onclick=loadExpenses;

function resetForm(){
  $("date").value=new Date().toISOString().slice(0,10);
  ["merchant","concept","amount","notes"].forEach(x=>$(x).value="");
  $("tax").value="0";
}

async function loadExpenses(){
  const now=new Date(), period=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const {data,error}=await sb.from("expenses").select("*").gte("date",period+"-01").order("date",{ascending:false});
  if(error){$("expenses").textContent=error.message;return;}
  const rows=data||[], total=rows.reduce((a,x)=>a+Number(x.amount||0),0);
  $("month-total").textContent=total.toLocaleString("es-ES",{style:"currency",currency:"EUR"});
  $("month-count").textContent=rows.length;
  $("expenses").innerHTML=rows.length
    ? rows.slice(0,30).map(x=>`<div class="expense-row"><div><b>${esc(x.merchant)}</b><br><small>${x.date} · ${esc(x.category||"Otros")}</small></div><strong>${Number(x.amount).toFixed(2)} €</strong></div>`).join("")
    : "Sin gastos este mes.";
}

function esc(s){
  return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

$("expenseForm").onsubmit=async e=>{
  e.preventDefault();
  if(!session)return;
  const expense={
    owner_id:session.user.id,
    date:$("date").value,
    merchant:$("merchant").value.trim(),
    concept:$("concept").value.trim(),
    category:$("category").value,
    amount:Number($("amount").value),
    tax:Number($("tax").value||0),
    payment_method:$("payment").value,
    scope:$("scope").value,
    notes:$("notes").value.trim()
  };
  const {data,error}=await sb.from("expenses").insert(expense).select().single();
  if(error){alert(error.message);return;}
  if(pendingScan){await uploadDocument(data.id,pendingScan);pendingScan=null;}
  show("dashboardView");
  await loadExpenses();
};

async function uploadDocument(expenseId,scan){
  const base=`${session.user.id}/${expenseId}/${Date.now()}`;
  const originalPath=base+"-original-"+safe(scan.original.name);
  const correctedPath=base+"-corrected.jpg";
  let r=await sb.storage.from("gasto360-documents").upload(originalPath,scan.original,{upsert:false,contentType:scan.original.type});
  if(r.error)throw r.error;
  r=await sb.storage.from("gasto360-documents").upload(correctedPath,scan.corrected,{upsert:false,contentType:"image/jpeg"});
  if(r.error)throw r.error;
  await sb.from("documents").insert([
    {owner_id:session.user.id,expense_id:expenseId,storage_path:originalPath,original_name:scan.original.name,doc_kind:"original",ocr_text:"",ocr_status:"original"},
    {owner_id:session.user.id,expense_id:expenseId,storage_path:correctedPath,original_name:"CORREGIDO_"+scan.original.name,doc_kind:"scanner_corrected",ocr_text:scan.text||"",ocr_status:scan.text?"ocr_ok":"not_run"}
  ]);
}

function safe(s){return String(s||"file").replace(/[^a-zA-Z0-9._-]/g,"_");}

window.gasto360Cloud={
  get sb(){return sb},
  get session(){return session},
  setScan(x){pendingScan=x},
  openExpense(){show("expenseView")},
  fill:(o)=>{
    resetForm();
    Object.entries(o).forEach(([k,v])=>{$(k)&&($(k).value=v??"")});
    show("expenseView");
  }
};
init();
})();
