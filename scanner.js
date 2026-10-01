(()=>{
const $=id=>document.getElementById(id);
const src=$("srcCanvas"),ov=$("overlayCanvas"),dst=$("dstCanvas"),reviewCanvas=$("reviewCanvas"),sctx=src.getContext("2d"),octx=ov.getContext("2d");
let file=null,pts=[],drag=-1,correctedBlob=null,ocrText="",ocrConfidence=0,lastFields={},lastExtraction=null,scanSubmissionId=null,saving=false;
let cropConfidence=0,knownMerchants=[];

const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9%€.,:/\- ]+/g," ").replace(/\s+/g," ").trim();
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const money=n=>Number(n||0).toLocaleString("es-ES",{style:"currency",currency:"EUR"});

function setStep(n){
  [1,2,3,4].forEach(i=>{$(`scanStep${i}`).hidden=i!==n;$(`scanStep${i}`).style.display=i===n?"":"none"});
  document.querySelectorAll(".scan-step").forEach(el=>{const i=Number(el.dataset.stepInd);el.classList.toggle("active",i===n);el.classList.toggle("done",i<n)});
  window.scrollTo({top:0,behavior:"smooth"})
}
function reset(){
  file=null;pts=[];drag=-1;correctedBlob=null;ocrText="";ocrConfidence=0;lastFields={};lastExtraction=null;scanSubmissionId=crypto.randomUUID?crypto.randomUUID():String(Date.now());saving=false;cropConfidence=0;
  src.width=src.height=ov.width=ov.height=dst.width=dst.height=reviewCanvas.width=reviewCanvas.height=1;
  $("cameraFile").value="";$("galleryFile").value="";$("scanDuplicateWarning").hidden=true;$("saveScanBtn").disabled=false;$("saveScanBtn").textContent="Guardar gasto + ticket";setStep(1)
}
window.gasto360Scanner={reset};

async function waitCV(ms=6000){const t=Date.now();while(Date.now()-t<ms){if(window.cv&&cv.Mat)return true;await sleep(120)}return false}
function sortPts(a){const sum=a.map(p=>p.x+p.y),dif=a.map(p=>p.x-p.y);return[a[sum.indexOf(Math.min(...sum))],a[dif.indexOf(Math.max(...dif))],a[sum.indexOf(Math.max(...sum))],a[dif.indexOf(Math.min(...dif))]]}
function angleScore(p){
  p=sortPts(p);let score=0;
  for(let i=0;i<4;i++){const a=p[(i+3)%4],b=p[i],c=p[(i+1)%4],v1={x:a.x-b.x,y:a.y-b.y},v2={x:c.x-b.x,y:c.y-b.y};const den=Math.hypot(v1.x,v1.y)*Math.hypot(v2.x,v2.y)||1;score+=1-Math.min(1,Math.abs((v1.x*v2.x+v1.y*v2.y)/den))}
  return score/4
}
function polyArea(p){let a=0;for(let i=0;i<p.length;i++){const j=(i+1)%p.length;a+=p[i].x*p[j].y-p[j].x*p[i].y}return Math.abs(a/2)}
function scoreQuad(p,w,h){const cov=polyArea(p)/(w*h),orth=angleScore(p),cx=p.reduce((a,x)=>a+x.x,0)/4,cy=p.reduce((a,x)=>a+x.y,0)/4,center=1-Math.min(1,Math.hypot(cx-w/2,cy-h/2)/Math.hypot(w/2,h/2));const covScore=cov<.12?0:cov>.98?.2:Math.min(1,cov/.55);return .52*covScore+.35*orth+.13*center}
function defaultPts(){const w=src.width,h=src.height,m=Math.max(15,Math.min(w,h)*.045);pts=[{x:m,y:m},{x:w-m,y:m},{x:w-m,y:h-m},{x:m,y:h-m}];cropConfidence=.35;drawOverlay()}
function drawOverlay(){
  ov.width=src.width;ov.height=src.height;octx.clearRect(0,0,ov.width,ov.height);if(pts.length!==4)return;
  octx.strokeStyle="#f1c84d";octx.fillStyle="rgba(255,255,255,.04)";octx.lineWidth=Math.max(3,src.width/300);octx.beginPath();octx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>octx.lineTo(p.x,p.y));octx.closePath();octx.fill();octx.stroke();
  pts.forEach((p,i)=>{octx.beginPath();octx.arc(p.x,p.y,Math.max(12,src.width/60),0,Math.PI*2);octx.fillStyle="#fff";octx.fill();octx.strokeStyle="#173548";octx.lineWidth=3;octx.stroke();octx.fillStyle="#173548";octx.font=`bold ${Math.max(13,src.width/48)}px sans-serif`;octx.textAlign="center";octx.textBaseline="middle";octx.fillText(i+1,p.x,p.y)})
}
function pos(e){const r=ov.getBoundingClientRect();return{x:(e.clientX-r.left)*ov.width/r.width,y:(e.clientY-r.top)*ov.height/r.height}}
function drawLoupe(p){
  const box=$("cornerLoupe"),lc=$("loupeCanvas"),ctx=lc.getContext("2d");lc.width=220;lc.height=220;
  const size=Math.max(80,src.width*.13),sx=clamp(p.x-size/2,0,Math.max(0,src.width-size)),sy=clamp(p.y-size/2,0,Math.max(0,src.height-size));
  ctx.drawImage(src,sx,sy,size,size,0,0,220,220);ctx.strokeStyle="#f1c84d";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(110,0);ctx.lineTo(110,220);ctx.moveTo(0,110);ctx.lineTo(220,110);ctx.stroke();
  const r=ov.getBoundingClientRect(),x=p.x*r.width/ov.width,y=p.y*r.height/ov.height;box.style.left=`${clamp(x+20,8,r.width-132)}px`;box.style.top=`${clamp(y-140,8,r.height-132)}px`;box.hidden=false
}
ov.onpointerdown=e=>{const p=pos(e);let best=-1,bd=1e9;pts.forEach((q,i)=>{const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<bd){bd=d;best=i}});if(bd<100){drag=best;ov.setPointerCapture(e.pointerId);drawLoupe(pts[drag])}};
ov.onpointermove=e=>{if(drag<0)return;const p=pos(e);pts[drag]={x:clamp(p.x,0,ov.width),y:clamp(p.y,0,ov.height)};cropConfidence=Math.max(.45,cropConfidence-.05);drawOverlay();drawLoupe(pts[drag])};
ov.onpointerup=()=>{drag=-1;$("cornerLoupe").hidden=true};

async function autoEdges(){
  if(!(await waitCV(2500))){defaultPts();setCropBanner("No pudimos activar la detección automática. Ajusta los 4 puntos.", "warn");return}
  let rgba,gray,blur,canny,thr,hierarchy,contours;const candidates=[];
  try{
    rgba=cv.imread(src);gray=new cv.Mat();blur=new cv.Mat();canny=new cv.Mat();thr=new cv.Mat();hierarchy=new cv.Mat();contours=new cv.MatVector();
    cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);cv.equalizeHist(gray,gray);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    for(const mode of ["canny","threshold"]){
      contours.delete();contours=new cv.MatVector();hierarchy.delete();hierarchy=new cv.Mat();
      if(mode==="canny"){cv.Canny(blur,canny,40,140);cv.findContours(canny,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE)}
      else{cv.adaptiveThreshold(blur,thr,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,31,9);cv.findContours(thr,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE)}
      for(let i=0;i<contours.size();i++){
        const c=contours.get(i),area=Math.abs(cv.contourArea(c));if(area<src.width*src.height*.08){c.delete();continue}
        const ap=new cv.Mat();cv.approxPolyDP(c,ap,.018*cv.arcLength(c,true),true);
        if(ap.rows===4){const q=[];for(let r=0;r<4;r++)q.push({x:ap.intPtr(r,0)[0],y:ap.intPtr(r,0)[1]});candidates.push({q:sortPts(q),score:scoreQuad(q,src.width,src.height)})}
        ap.delete();c.delete()
      }
    }
    candidates.sort((a,b)=>b.score-a.score);
    if(candidates.length){pts=candidates[0].q;cropConfidence=candidates[0].score;drawOverlay();setCropBanner(cropConfidence>.78?"Bordes detectados con alta confianza.":"Bordes detectados. Comprueba los 4 puntos.",cropConfidence>.65?"ok":"warn")}
    else{defaultPts();setCropBanner("No encontramos los 4 bordes con suficiente seguridad. Ajusta los puntos manualmente.","warn")}
  }catch(e){console.error(e);defaultPts();setCropBanner("La detección automática no fue concluyente. Ajusta los 4 puntos.","warn")}
  finally{[rgba,gray,blur,canny,thr,hierarchy].forEach(x=>{try{x&&x.delete()}catch{}});try{contours&&contours.delete()}catch{}}
}
function setCropBanner(msg,kind="ok"){$("qualityBanner").hidden=false;$("qualityBanner").className="quality-banner"+(kind==="ok"?"":` ${kind}`);$("qualityBanner").textContent=msg}

function imageQuality(){
  if(!window.cv||!cv.Mat)return {blur:null,brightness:null};
  let a,g,lap;try{a=cv.imread(src);g=new cv.Mat();lap=new cv.Mat();cv.cvtColor(a,g,cv.COLOR_RGBA2GRAY);const mean=cv.mean(g)[0];cv.Laplacian(g,lap,cv.CV_64F);const m=new cv.Mat(),sd=new cv.Mat();cv.meanStdDev(lap,m,sd);const variance=sd.doubleAt(0,0)**2;m.delete();sd.delete();return {blur:variance,brightness:mean}}catch{return {blur:null,brightness:null}}finally{[a,g,lap].forEach(x=>{try{x&&x.delete()}catch{}})}
}
function clearCaptureState(){
  file=null;pts=[];drag=-1;correctedBlob=null;ocrText="";ocrConfidence=0;lastFields={};lastExtraction=null;
  scanSubmissionId=crypto.randomUUID?crypto.randomUUID():String(Date.now());
  saving=false;cropConfidence=0;
  $("scanDuplicateWarning").hidden=true;
  $("saveScanBtn").disabled=false;$("saveScanBtn").textContent="Guardar gasto + ticket";
}
async function decodeCaptureToSource(f){
  let bitmap=null;
  if("createImageBitmap" in window){
    try{bitmap=await createImageBitmap(f,{imageOrientation:"from-image"})}catch(e){console.warn("createImageBitmap fallo",e)}
  }
  if(bitmap){
    const scale=Math.min(1,1900/Math.max(bitmap.width,bitmap.height));
    src.width=Math.max(2,Math.round(bitmap.width*scale));src.height=Math.max(2,Math.round(bitmap.height*scale));
    sctx.clearRect(0,0,src.width,src.height);sctx.drawImage(bitmap,0,0,src.width,src.height);
    try{bitmap.close()}catch{}
    return;
  }
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error("No se pudo leer la foto"));r.readAsDataURL(f)});
  await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{const scale=Math.min(1,1900/Math.max(im.naturalWidth,im.naturalHeight));src.width=Math.max(2,Math.round(im.naturalWidth*scale));src.height=Math.max(2,Math.round(im.naturalHeight*scale));sctx.clearRect(0,0,src.width,src.height);sctx.drawImage(im,0,0,src.width,src.height);resolve()};im.onerror=()=>reject(new Error("Formato de imagen no compatible"));im.src=dataUrl})
}
async function loadFile(f){
  if(!f){window.gasto360Cloud.toast("La cámara no entregó ninguna foto. Inténtalo de nuevo.","warn");return}
  clearCaptureState();
  file=f;
  sessionStorage.removeItem("gasto360.capture.pending");
  setStep(2);
  $("cropHint").innerHTML='<span class="capture-return-status"><span class="mini-spinner"></span>Foto recibida. Preparando encuadre...</span>';
  $("qualityBanner").hidden=true;
  try{
    await decodeCaptureToSource(f);
    defaultPts();
    $("cropHint").textContent="Analizando la foto y buscando los bordes...";
    await waitCV(1800);
    const q=imageQuality();let qualityMsg=[],kind="ok";
    if(q.blur!==null&&q.blur<55){qualityMsg.push("La foto parece algo borrosa");kind="warn"}
    if(q.brightness!==null&&(q.brightness<55||q.brightness>225)){qualityMsg.push("La iluminación puede mejorarse");kind="warn"}
    if(qualityMsg.length)setCropBanner(qualityMsg.join(". ")+"; puedes repetir la foto o continuar.",kind);
    await autoEdges();
    $("cropHint").textContent="Foto recibida correctamente. Mueve un punto solo si la línea amarilla no coincide con el borde real del ticket.";
  }catch(err){
    console.error(err);
    setStep(1);
    window.gasto360Cloud.toast("La foto se recibió, pero no pudimos abrirla: "+(err.message||err),"error",6500);
  }
}
$("cameraFile").addEventListener("click",e=>{e.currentTarget.value="";sessionStorage.setItem("gasto360.capture.pending","camera")});
$("galleryFile").addEventListener("click",e=>{e.currentTarget.value="";sessionStorage.setItem("gasto360.capture.pending","gallery")});
$("cameraFile").addEventListener("change",e=>loadFile(e.currentTarget.files&&e.currentTarget.files[0]));
$("galleryFile").addEventListener("change",e=>loadFile(e.currentTarget.files&&e.currentTarget.files[0]));
$("cameraFile").addEventListener("cancel",()=>sessionStorage.removeItem("gasto360.capture.pending"));
$("galleryFile").addEventListener("cancel",()=>sessionStorage.removeItem("gasto360.capture.pending"));
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible" && sessionStorage.getItem("gasto360.capture.pending")){
    setTimeout(()=>{
      if(sessionStorage.getItem("gasto360.capture.pending") && !file){
        window.gasto360Cloud.toast("Hemos vuelto de la cámara. Si no aparece la foto en unos segundos, pulsa Abrir cámara de nuevo.","warn",5000)
      }
    },1200)
  }
});
$("retakeBtn").onclick=reset;$("autoEdges").onclick=autoEdges;$("acceptCrop").onclick=()=>processScan();

function canvasBlob(c,q=.94){return new Promise(res=>c.toBlob(res,"image/jpeg",q))}
async function correctPerspective(){
  const p=sortPts(pts),dist=(x,y)=>Math.hypot(x.x-y.x,x.y-y.y),w=Math.max(400,Math.round(Math.max(dist(p[0],p[1]),dist(p[3],p[2])))),h=Math.max(500,Math.round(Math.max(dist(p[0],p[3]),dist(p[1],p[2]))));
  if(!(await waitCV(2000))){dst.width=src.width;dst.height=src.height;dst.getContext("2d").drawImage(src,0,0);correctedBlob=await canvasBlob(dst);return}
  let a,sp,dp,M,out;try{a=cv.imread(src);sp=cv.matFromArray(4,1,cv.CV_32FC2,[p[0].x,p[0].y,p[1].x,p[1].y,p[2].x,p[2].y,p[3].x,p[3].y]);dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);M=cv.getPerspectiveTransform(sp,dp);out=new cv.Mat();cv.warpPerspective(a,out,M,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());dst.width=w;dst.height=h;cv.imshow(dst,out)}finally{[a,sp,dp,M,out].forEach(x=>{try{x&&x.delete()}catch{}})}
  correctedBlob=await canvasBlob(dst)
}
function updateProgress(p,title,detail){$("ocrProgressBar").style.width=`${clamp(p,0,100)}%`;$("processingTitle").textContent=title;$("processingDetail").textContent=detail}
async function processScan(){
  setStep(3);updateProgress(8,"Corrigiendo perspectiva...","Alineando el documento");
  try{await correctPerspective();updateProgress(25,"Mejorando legibilidad...","Contraste, escala y limpieza");knownMerchants=await window.gasto360Cloud.getKnownMerchants();await runOCR();renderFinalReview();setStep(4)}catch(e){console.error(e);window.gasto360Cloud.toast("No se pudo completar el análisis. Puedes repetir la foto.","error",6000);setStep(2)}
}

function makeOcrCanvas(mode="gray"){
  const c=document.createElement("canvas"),ctx=c.getContext("2d"),scale=Math.min(1.7,2200/Math.max(dst.width,dst.height));c.width=Math.round(dst.width*scale);c.height=Math.round(dst.height*scale);ctx.drawImage(dst,0,0,c.width,c.height);
  const im=ctx.getImageData(0,0,c.width,c.height),a=im.data,gray=new Uint8Array(c.width*c.height);let lo=255,hi=0;for(let i=0,j=0;i<a.length;i+=4,j++){const g=Math.round(.299*a[i]+.587*a[i+1]+.114*a[i+2]);gray[j]=g;lo=Math.min(lo,g);hi=Math.max(hi,g)}
  const span=Math.max(35,hi-lo);for(let i=0,j=0;i<a.length;i+=4,j++){let g=(gray[j]-lo)*255/span;g=clamp((g-128)*1.35+128,0,255);if(mode==="binary")g=g>158?255:0;a[i]=a[i+1]=a[i+2]=g;a[i+3]=255}ctx.putImageData(im,0,0);return c
}
function moneyVals(line){return [...line.matchAll(/(?<!\d)(\d{1,6}(?:[.,]\d{2}))(?!\d)/g)].map(m=>Number(m[1].replace(",","."))).filter(n=>Number.isFinite(n)&&n>=0&&n<100000)}
function cleanLine(s){return String(s||"").replace(/[|_*~]/g," ").replace(/\s+/g," ").trim()}
function parseDate(text){let m=text.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](20\d{2})\b/);if(m)return `${m[3]}-${m[2]}-${m[1]}`;m=text.match(/\b(20\d{2})[\/.\-](\d{2})[\/.\-](\d{2})\b/);return m?`${m[1]}-${m[2]}-${m[3]}`:""}
const merchantRules=[
  [/MERCADONA/,"MERCADONA, S.A.","Alimentación"],[/CARREFOUR/,"Carrefour","Alimentación"],[/LIDL/,"Lidl","Alimentación"],[/ALDI/,"Aldi","Alimentación"],[/SUPERMERCADOS?\s*DIA|\bDIA\b/,"DIA","Alimentación"],[/CONSUM/,"Consum","Alimentación"],[/HIPERCOR|EL CORTE INGLES/,"El Corte Inglés","Otros"],[/REPSOL/,"Repsol","Vehículo"],[/CEPSA/,"Cepsa","Vehículo"],[/SHELL/,"Shell","Vehículo"],[/BP\b/,"BP","Vehículo"],[/MEDIAMARKT/,"MediaMarkt","Tecnología"],[/PC\s*COMPONENTES|PCCOMPONENTES/,"PcComponentes","Tecnología"],[/AMAZON/,"Amazon","Otros"]
];
function merchantCandidates(lines,text){
  const all=normalize(text),out=[];
  for(const [re,name,cat] of merchantRules)if(re.test(all))out.push({name,cat,score:100});
  for(const km of knownMerchants||[]){const nk=normalize(km);if(nk.length>3&&(all.includes(nk)||nk.includes(normalize(lines[0]||"__"))))out.push({name:km,cat:null,score:92})}
  const ignore=/FACTURA|TICKET|RECIBO|FECHA|HORA|TELEF|TEL\b|AV\b|AVD|CALLE|C\/|CP\b|TOTAL|IVA|BASE|CUOTA|DESCRIP|CAJA|MESA|CLIENTE|GRACIAS|ENTREGA|DEVOLU|EFECTIVO|TARJETA|ORDEN/i;
  lines.slice(0,12).forEach((l,i)=>{const u=normalize(l),letters=(u.match(/[A-Z]/g)||[]).length,digits=(u.match(/\d/g)||[]).length;if(letters<4||ignore.test(u))return;let s=70-i*3+Math.min(18,letters)-digits*5;if(u.length>36)s-=16;if(/S\.?A\.?|S\.?L\.?|SLU|CB\b/.test(u))s+=12;out.push({name:cleanLine(l),score:s,cat:null})});
  const seen=new Set();return out.sort((a,b)=>b.score-a.score).filter(x=>{const n=normalize(x.name);if(seen.has(n))return false;seen.add(n);return true}).slice(0,4)
}
function detectTaxId(text){const t=normalize(text);let m=t.match(/\b([ABCDEFGHJNPQRSUVW])[\s\-]?(\d{8})\b/);if(m)return `${m[1]}-${m[2]}`;m=t.match(/\b(?:CIF|NIF|NIE)\s*[:\-]?\s*([A-Z0-9\-]{7,14})/);return m?m[1]:""}
function detectInvoice(text){const t=normalize(text);const pats=[/FACTURA\s+SIMPLIFICADA\s*[:#\-]?\s*([0-9A-Z][0-9A-Z\-\/]{5,})/,/TICKET\s*(?:N|NO|NUM|Nº|#)?\s*[:#\-]?\s*([0-9A-Z][0-9A-Z\-\/]{4,})/,/FACTURA\s*(?:N|NO|NUM|Nº|#)?\s*[:#\-]?\s*([0-9A-Z][0-9A-Z\-\/]{4,})/];for(const p of pats){const m=t.match(p);if(m&&m[1]&&!/SIMPLIFICADA|PROFORMA/.test(m[1]))return m[1]}return ""}
function inferCategory(s){const x=normalize(s);if(/MERCADONA|CARREFOUR|LIDL|ALDI|SUPERMERC|ALIMENT|RESTAUR|BAR\b|CAFE|BODEGA|PANADER/.test(x))return"Alimentación";if(/REPSOL|CEPSA|BP\b|SHELL|GASOLIN|COMBUST|TALLER|PARKING/.test(x))return"Vehículo";if(/FARMAC|CLINIC|MEDIC|DENT/.test(x))return"Salud";if(/MEDIAMARKT|PCCOMPONENT|ELECTRON|INFORMAT|TELEFON/.test(x))return"Tecnología";if(/LEROY|IKEA|FERRETER|HOGAR|MUEBLE/.test(x))return"Hogar";if(/CINE|TEATRO|HOTEL|VIAJE/.test(x))return"Ocio";if(/COLEGIO|ACADEM|LIBR|EDUCA/.test(x))return"Educación";return"Otros"}
function extractItems(lines){
  let start=lines.findIndex(l=>/DESCRIPCI|DESCRIPCION|ARTICULO|PRODUCTO/i.test(normalize(l)));const out=[];if(start<0)start=0;
  for(let i=start+1;i<Math.min(lines.length,start+30);i++){const l=cleanLine(lines[i]),u=normalize(l);if(/^\s*(TOTAL|SUBTOTAL|ENTREGA|DEVOLU|CAMBIO|IVA|BASE IMPONIBLE|FORMA DE PAGO)/.test(u))break;if(!moneyVals(l).length)continue;let name=l.replace(/^\s*\d+\s+/,"").replace(/\s+\d{1,6}[.,]\d{2}(?:\s+\d{1,6}[.,]\d{2})?\s*$/,"").trim();name=name.replace(/\s{2,}.*/,"").trim();if(name.length>=3&&/[A-Za-zÁÉÍÓÚÜÑ]/.test(name))out.push({name,amounts:moneyVals(l)})}
  return out.slice(0,20)
}
function extractMoneyCandidates(lines){
  const out=[];lines.forEach((l,i)=>moneyVals(l).forEach(v=>out.push({value:v,line:i,text:l})));const seen=new Set();return out.filter(x=>{const k=x.value.toFixed(2);if(seen.has(k))return false;seen.add(k);return true}).slice(0,12)
}
function detectTotals(lines){
  const cand=extractMoneyCandidates(lines);let best=null,bestScore=-1e9;
  lines.forEach((l,i)=>{const u=normalize(l),vals=moneyVals(l);if(!vals.length)return;const prev=normalize(lines.slice(Math.max(0,i-2),i).join(" "));const taxTable=/BASE IMPONIBLE|CUOTA/.test(u+" "+prev);for(const v of vals){let s=v/1000;if(/\bTOTAL\b/.test(u))s+=taxTable?25:180;if(/TOTAL\s*\(?€?\)?/.test(u)&&vals.length===1)s+=70;if(/A PAGAR|IMPORTE TOTAL/.test(u))s+=180;if(/ENTREGA|RECIBIDO/.test(u))s-=110;if(/DEVOLU|CAMBIO/.test(u))s-=130;if(/BASE IMPONIBLE|CUOTA|IVA/.test(u))s-=80;if(i>lines.length*.35)s+=10;if(s>bestScore){bestScore=s;best={value:v,line:i,score:s}}}}
  );
  let tax=0,base=null;
  for(let i=0;i<lines.length;i++){const u=normalize(lines[i]);if(/IVA.*BASE IMPONIBLE.*CUOTA|BASE IMPONIBLE.*CUOTA/.test(u)){for(let j=i+1;j<=Math.min(i+4,lines.length-1);j++){const vals=moneyVals(lines[j]),uj=normalize(lines[j]);if(vals.length>=2&&(/%/.test(uj)||/TOTAL/.test(uj))){if(/%/.test(uj)){base=(base||0)+vals[vals.length-2];tax+=vals[vals.length-1]}}}}}
  if(tax===0){for(const l of lines){const u=normalize(l),vals=moneyVals(l);if(vals.length&&/\bIVA\b|CUOTA/.test(u)&&!/TOTAL/.test(u)){tax=Math.max(tax,vals[vals.length-1])}}}
  if(best&&base!==null&&tax>0&&Math.abs((base+tax)-best.value)>.03){const fiscalTotal=base+tax;const near=cand.find(c=>Math.abs(c.value-fiscalTotal)<.03);if(near)best={value:near.value,line:near.line,score:250}}
  return {total:best?.value??"",tax:Number(tax.toFixed(2)),base:base===null?null:Number(base.toFixed(2)),candidates:cand.map(x=>x.value)}
}
function paymentFrom(text){const u=normalize(text);if(/EFECTIVO|ENTREGA EFECTIVO/.test(u))return"Efectivo";if(/VISA|MASTERCARD|TARJETA|CARD/.test(u))return"Tarjeta";if(/BIZUM/.test(u))return"Bizum";return"Otro"}
function extractReceipt(text,baseConf){
  const lines=text.split(/\r?\n/).map(cleanLine).filter(x=>x.length>1),mc=merchantCandidates(lines,text),tot=detectTotals(lines),items=extractItems(lines),date=parseDate(text),taxId=detectTaxId(text),invoiceNo=detectInvoice(text);
  const merchant=mc[0]?.name||"",knownCat=mc[0]?.cat,concept=items.length?items.slice(0,3).map(x=>x.name).join(" + "):(merchant?`Compra en ${merchant}`:""),category=knownCat||inferCategory(`${merchant} ${concept}`),payment=paymentFrom(text);
  const conf={merchant:merchant?(mc[0]?.score>=95?98:Math.min(90,mc[0]?.score||70)):20,date:date?96:20,amount:tot.total!==""?98:20,tax:tot.tax>0?94:35,concept:items.length?92:(merchant?58:25)};
  const critical=[conf.merchant,conf.date,conf.amount,conf.concept],overall=Math.round((Number(baseConf||0)+critical.reduce((a,b)=>a+b,0))/5);
  return {merchant,date,amount:tot.total,tax:tot.tax,base:tot.base,concept,category,payment,taxId,invoiceNo,items,merchantCandidates:mc,amountCandidates:tot.candidates,confidence:conf,overall,lines}
}
function extractionScore(f){return (f.merchant?30:0)+(f.date?20:0)+(f.amount!==""?30:0)+(f.tax>0?8:0)+(f.items?.length?15:0)+(f.taxId?5:0)+(f.invoiceNo?5:0)+f.overall/10}
async function recognizeCanvas(c,label,base,span){
  const blob=await canvasBlob(c,.95);let last=0;
  const r=await Tesseract.recognize(blob,"spa+eng",{logger:m=>{if(m.progress){last=m.progress;updateProgress(base+m.progress*span,`Leyendo ticket (${label})...`,`${Math.round(m.progress*100)}%`)}}});
  return {text:r.data.text||"",confidence:Number(r.data.confidence||0)}
}
async function runOCR(){
  updateProgress(32,"Leyendo ticket...","Primera lectura");
  const a=await recognizeCanvas(makeOcrCanvas("gray"),"1/2",32,38),fa=extractReceipt(a.text,a.confidence);
  let best={r:a,f:fa};
  const needsSecond=!fa.merchant||fa.amount===""||fa.overall<82||!fa.items.length||(!fa.tax&&/IVA|CUOTA/.test(normalize(a.text)));
  if(needsSecond){updateProgress(72,"Comprobando resultados...","Segunda lectura para resolver dudas");const b=await recognizeCanvas(makeOcrCanvas("binary"),"2/2",72,22),fb=extractReceipt(b.text,b.confidence);if(extractionScore(fb)>extractionScore(fa))best={r:b,f:fb}}
  ocrText=best.r.text;ocrConfidence=best.r.confidence;lastExtraction=best.f;lastFields=best.f;updateProgress(98,"Validando importes...","Comprobando total e IVA");await sleep(250)
}
function confClass(n){return n>=85?"good":n>=60?"warn":"bad"}
function setField(id,conf){const el=$(id);el.classList.remove("good","warn","bad");el.classList.add(confClass(conf))}
function confText(n){return `Confianza ${Math.round(Number(n||0))}%`}
function chips(id,values,selected,onClick,fmt=x=>String(x)){
  const host=$(id);host.innerHTML="";for(const v of values.slice(0,5)){const b=document.createElement("button");b.type="button";b.className="candidate-chip"+(String(v)===String(selected)?" selected":"");b.textContent=fmt(v);b.onclick=()=>onClick(v);host.appendChild(b)}
}
function renderFinalReview(){
  const f=lastExtraction||{};$("ocrMerchant").value=f.merchant||"";$("ocrDate").value=f.date||new Date().toISOString().slice(0,10);$("ocrAmount").value=f.amount??"";$("ocrTax").value=f.tax??0;$("ocrConcept").value=f.concept||"";$("ocrCategory").value=f.category||"Otros";$("ocrPayment").value=f.payment||"Otro";$("ocrTaxId").value=f.taxId||"";$("ocrInvoiceNo").value=f.invoiceNo||"";
  $("confMerchant").textContent=confText(f.confidence?.merchant);$("confDate").textContent=confText(f.confidence?.date);$("confAmount").textContent=confText(f.confidence?.amount);$("confTax").textContent=confText(f.confidence?.tax);$("confConcept").textContent=confText(f.confidence?.concept);$("ocrOverallConfidence").textContent=`OCR ${Math.round(f.overall||0)}%`;
  setField("fieldMerchant",f.confidence?.merchant||0);setField("fieldDate",f.confidence?.date||0);setField("fieldAmount",f.confidence?.amount||0);setField("fieldTax",f.confidence?.tax||0);setField("fieldConcept",f.confidence?.concept||0);
  chips("merchantCandidates",(f.merchantCandidates||[]).map(x=>x.name),f.merchant,v=>{$("ocrMerchant").value=v;renderCandidateSelections()} );
  chips("amountCandidates",(f.amountCandidates||[]).filter((v,i,a)=>a.indexOf(v)===i),f.amount,v=>{$("ocrAmount").value=v;renderFiscalCheck();renderCandidateSelections()},v=>money(v));
  renderItems(f.items||[]);renderFiscalCheck();$("ocrRawText").textContent=ocrText;
  reviewCanvas.width=dst.width;reviewCanvas.height=dst.height;reviewCanvas.getContext("2d").drawImage(dst,0,0);
  const low=["merchant","date","amount","concept"].filter(k=>(f.confidence?.[k]||0)<75).length;$("reviewSummary").textContent=low?`Hay ${low} campo${low===1?"":"s"} que conviene revisar.`:"La lectura es consistente. Revisa y guarda.";
  updateProgress(100,"Lectura completada","Listo para revisar")
}
function renderCandidateSelections(){const f=lastExtraction||{};chips("merchantCandidates",(f.merchantCandidates||[]).map(x=>x.name),$("ocrMerchant").value,v=>{$("ocrMerchant").value=v;renderCandidateSelections()});chips("amountCandidates",(f.amountCandidates||[]).filter((v,i,a)=>a.indexOf(v)===i),Number($("ocrAmount").value),v=>{$("ocrAmount").value=v;renderFiscalCheck();renderCandidateSelections()},v=>money(v))}
function renderItems(items){$("itemsTitle").textContent=items.length?`${items.length} producto${items.length===1?"":"s"} detectado${items.length===1?"":"s"}`:"Sin productos identificados";$("itemsList").innerHTML=items.length?items.map(x=>`<div class="item-row"><span>${escapeHtml(x.name)}</span><b>${x.amounts?.length?money(x.amounts[x.amounts.length-1]):""}</b></div>`).join(""):'<div class="empty">Puedes escribir el concepto manualmente.</div>'}
function escapeHtml(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function renderFiscalCheck(){const f=lastExtraction||{},total=Number($("ocrAmount").value||0),tax=Number($("ocrTax").value||0),base=f.base;const box=$("fiscalCheck");if(base!==null&&base!==undefined&&tax>0&&total>0){const diff=Math.abs(base+tax-total);box.hidden=false;box.className="fiscal-check"+(diff<=.03?"":" warn");box.textContent=diff<=.03?`✓ Cuadre fiscal: ${money(base)} base + ${money(tax)} IVA = ${money(total)}`:`⚠ Revisa importes: base ${money(base)} + IVA ${money(tax)} no coincide con total ${money(total)}`}else box.hidden=true}
$("ocrAmount").oninput=renderFiscalCheck;$("ocrTax").oninput=renderFiscalCheck;
$("repeatOcrBtn").onclick=async()=>{setStep(3);await runOCR();renderFinalReview();setStep(4)};
$("editItemsBtn").onclick=()=>{const txt=(lastExtraction?.items||[]).map(x=>x.name).join(" + ");$("ocrConcept").value=txt;$("ocrConcept").focus()};

function buildPayload(){
  const fields={merchant:$("ocrMerchant").value.trim(),date:$("ocrDate").value,amount:Number($("ocrAmount").value),tax:Number($("ocrTax").value||0),concept:$("ocrConcept").value.trim(),category:$("ocrCategory").value,payment:$("ocrPayment").value};
  const scan={original:file,corrected:correctedBlob,text:ocrText,confidence:ocrConfidence,fields:{...lastExtraction,...fields,scannerVersion:"R8.4.1",cropConfidence}};
  return {fields,scan,submissionId:scanSubmissionId}
}
async function doSave(force=false){
  if(saving)return;saving=true;$("saveScanBtn").disabled=true;$("saveScanBtn").textContent="Guardando gasto y ticket...";
  try{
    const r=await window.gasto360Cloud.saveScannedExpense(buildPayload(),force);
    if(r.duplicate){$("scanDuplicateWarning").hidden=false;$("scanDuplicateExisting").innerHTML=r.rows.map(x=>`<div><b>${escapeHtml(x.merchant)}</b> · ${escapeHtml(x.date)} · ${money(x.amount)}</div>`).join("");$("scanDuplicateWarning").scrollIntoView({behavior:"smooth",block:"center"});return}
    if(!r.ok)throw new Error(r.error||"No se pudo guardar");
    window.gasto360Cloud.toast(r.pending?`Gasto guardado. ${r.pending} archivo(s) pendiente(s) de subida.`:"Gasto y ticket guardados correctamente.",r.pending?"warn":"ok",6000);
    reset();window.gasto360Cloud.goHome()
  }catch(e){window.gasto360Cloud.toast("No se pudo guardar: "+e.message,"error",6000)}
  finally{saving=false;$("saveScanBtn").disabled=false;$("saveScanBtn").textContent="Guardar gasto + ticket"}
}
$("saveScanBtn").onclick=()=>doSave(false);$("forceScanSave").onclick=()=>{ $("scanDuplicateWarning").hidden=true;doSave(true)};$("cancelScanDuplicate").onclick=()=>{$("scanDuplicateWarning").hidden=true};
reset();
})();