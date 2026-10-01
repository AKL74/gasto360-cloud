(()=>{
const $=id=>document.getElementById(id);
const src=$("srcCanvas"),ov=$("overlayCanvas"),dst=$("dstCanvas"),sctx=src.getContext("2d"),octx=ov.getContext("2d");
let file=null,pts=[],drag=-1,correctedBlob=null,ocrText="",ocrConfidence=0,lastFields={};

const status=(m)=>{$("scannerStatus").textContent=m};
const ocrStatus=(m)=>{$("ocrStatus").textContent=m};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function resetScanner(){
  file=null;pts=[];correctedBlob=null;ocrText="";ocrConfidence=0;lastFields={};
  sctx.clearRect(0,0,src.width,src.height);octx.clearRect(0,0,ov.width,ov.height);
  const dctx=dst.getContext("2d");dctx.clearRect(0,0,dst.width,dst.height);
  visibleReview(false);$("ocrBtn").disabled=true;status("Haz una foto o elige un ticket.");ocrStatus("Esperando imagen.")
}
function visibleReview(on){$("ocrReview").hidden=!on;$("ocrReview").style.display=on?"":"none"}
function defaultPts(){const w=src.width,h=src.height,m=Math.max(15,Math.min(w,h)*.035);pts=[{x:m,y:m},{x:w-m,y:m},{x:w-m,y:h-m},{x:m,y:h-m}];drawOverlay()}
function drawOverlay(){
  ov.width=src.width;ov.height=src.height;octx.clearRect(0,0,ov.width,ov.height);if(pts.length!==4)return;
  octx.strokeStyle="#e4c35d";octx.fillStyle="rgba(255,255,255,.06)";octx.lineWidth=Math.max(3,src.width/300);
  octx.beginPath();octx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>octx.lineTo(p.x,p.y));octx.closePath();octx.fill();octx.stroke();
  pts.forEach((p,i)=>{octx.beginPath();octx.arc(p.x,p.y,Math.max(11,src.width/60),0,Math.PI*2);octx.fillStyle="#fff";octx.fill();octx.strokeStyle="#173548";octx.stroke();octx.fillStyle="#173548";octx.font=`bold ${Math.max(12,src.width/50)}px sans-serif`;octx.textAlign="center";octx.textBaseline="middle";octx.fillText(i+1,p.x,p.y)})
}
function ppos(e){const r=ov.getBoundingClientRect();return{x:(e.clientX-r.left)*ov.width/r.width,y:(e.clientY-r.top)*ov.height/r.height}}
ov.onpointerdown=e=>{const p=ppos(e);let best=-1,bd=1e9;pts.forEach((q,i)=>{const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<bd){bd=d;best=i}});if(bd<90){drag=best;ov.setPointerCapture(e.pointerId)}};
ov.onpointermove=e=>{if(drag<0)return;const p=ppos(e);pts[drag]={x:clamp(p.x,0,ov.width),y:clamp(p.y,0,ov.height)};drawOverlay()};
ov.onpointerup=()=>drag=-1;

async function waitCV(ms=7000){const start=Date.now();while(Date.now()-start<ms){if(window.cv&&cv.Mat)return true;await new Promise(r=>setTimeout(r,150))}return false}
function sortPts(a){const sum=a.map(p=>p.x+p.y),dif=a.map(p=>p.x-p.y);return[a[sum.indexOf(Math.min(...sum))],a[dif.indexOf(Math.max(...dif))],a[sum.indexOf(Math.max(...sum))],a[dif.indexOf(Math.min(...dif))]]}

async function autoEdges(){
  if(!(await waitCV(2500))){status("OpenCV no está listo; usaré los vértices iniciales.");return false}
  let a,b,c,e,cont,h;try{
    a=cv.imread(src);b=new cv.Mat();c=new cv.Mat();e=new cv.Mat();cont=new cv.MatVector();h=new cv.Mat();
    cv.cvtColor(a,b,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(b,c,new cv.Size(5,5),0);cv.Canny(c,e,45,150);cv.findContours(e,cont,h,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    let best=null,area=0;
    for(let i=0;i<cont.size();i++){const x=cont.get(i),ap=new cv.Mat();cv.approxPolyDP(x,ap,.018*cv.arcLength(x,true),true);const ar=Math.abs(cv.contourArea(ap));if(ap.rows===4&&ar>src.width*src.height*.12&&ar>area){best=[];for(let r=0;r<4;r++)best.push({x:ap.intPtr(r,0)[0],y:ap.intPtr(r,0)[1]});area=ar}ap.delete();x.delete()}
    if(best){pts=sortPts(best);drawOverlay();status("Bordes detectados. Puedes ajustar los 4 puntos.");return true}
    status("No encontré un contorno claro. Ajusta manualmente los 4 puntos.");return false
  }catch(err){console.error(err);status("No se pudo detectar automáticamente. Ajusta los 4 puntos.");return false}
  finally{[a,b,c,e,h].forEach(x=>{try{x&&x.delete()}catch{}});try{cont&&cont.delete()}catch{}}
}

async function correctPerspective(runOcr=true){
  if(!file||pts.length!==4)return;
  if(!(await waitCV(2500))){copySourceToDst();correctedBlob=await canvasBlob(dst,.92);$("ocrBtn").disabled=false;if(runOcr)await runOCR();return}
  const p=sortPts(pts),d=(x,y)=>Math.hypot(x.x-y.x,x.y-y.y),w=Math.max(320,Math.round(Math.max(d(p[0],p[1]),d(p[3],p[2])))),h=Math.max(320,Math.round(Math.max(d(p[0],p[3]),d(p[1],p[2]))));
  let a,M,out,sp,dp;try{
    a=cv.imread(src);sp=cv.matFromArray(4,1,cv.CV_32FC2,[p[0].x,p[0].y,p[1].x,p[1].y,p[2].x,p[2].y,p[3].x,p[3].y]);dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);
    M=cv.getPerspectiveTransform(sp,dp);out=new cv.Mat();cv.warpPerspective(a,out,M,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());dst.width=w;dst.height=h;cv.imshow(dst,out)
  }catch(err){console.error(err);copySourceToDst()}finally{[a,M,out,sp,dp].forEach(x=>{try{x&&x.delete()}catch{}})}
  correctedBlob=await canvasBlob(dst,.93);$("ocrBtn").disabled=false;status("Perspectiva corregida. Extrayendo datos...");if(runOcr)await runOCR()
}
function copySourceToDst(){dst.width=src.width;dst.height=src.height;dst.getContext("2d").drawImage(src,0,0)}
function canvasBlob(c,q=.92){return new Promise(res=>c.toBlob(res,"image/jpeg",q))}

function makeOcrCanvas(){
  const c=document.createElement("canvas"),ctx=c.getContext("2d"),scale=Math.min(1.35,1800/Math.max(dst.width,dst.height));
  c.width=Math.round(dst.width*scale);c.height=Math.round(dst.height*scale);ctx.drawImage(dst,0,0,c.width,c.height);
  const im=ctx.getImageData(0,0,c.width,c.height),a=im.data,gray=new Uint8Array(c.width*c.height);
  let lo=255,hi=0;for(let i=0,j=0;i<a.length;i+=4,j++){const g=Math.round(.299*a[i]+.587*a[i+1]+.114*a[i+2]);gray[j]=g;if(g<lo)lo=g;if(g>hi)hi=g}
  const span=Math.max(40,hi-lo);for(let i=0,j=0;i<a.length;i+=4,j++){let g=(gray[j]-lo)*255/span;g=clamp((g-128)*1.28+128,0,255);a[i]=a[i+1]=a[i+2]=g;a[i+3]=255}ctx.putImageData(im,0,0);return c
}
function cleanLine(s){return s.replace(/[|_*~]/g," ").replace(/\s+/g," ").trim()}
function moneyVals(line){return [...line.matchAll(/(?<!\d)(\d{1,6}(?:[.,]\d{2}))(?!\d)/g)].map(m=>Number(m[1].replace(",","."))).filter(n=>Number.isFinite(n)&&n>=0&&n<100000)}
function parseDate(text){
  const pats=[/\b(\d{2})[\/.\-](\d{2})[\/.\-](20\d{2})\b/,/\b(20\d{2})[\/.\-](\d{2})[\/.\-](\d{2})\b/];
  let m=text.match(pats[0]);if(m)return `${m[3]}-${m[2]}-${m[1]}`;m=text.match(pats[1]);if(m)return `${m[1]}-${m[2]}-${m[3]}`;return ""
}
function extractReceipt(text,baseConf){
  const lines=text.split(/\r?\n/).map(cleanLine).filter(x=>x.length>1),upper=lines.map(x=>x.toUpperCase());
  const ignored=/^(TICKET|FACTURA|RECIBO|GRACIAS|THANK|FECHA|HORA|CAJA|MESA|CLIENTE|CIF|NIF|NIE|TEL|TFNO|WWW|HTTP|DIRECCI|DOMICILIO|TOTAL|SUBTOTAL|IVA|IMPORTE|PAGO|TARJETA|EFECTIVO)/i;
  let merchant="",best=-999;
  lines.slice(0,15).forEach((l,i)=>{if(ignored.test(l)||/@|www\.|http/i.test(l))return;const letters=(l.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[]).length,digits=(l.match(/\d/g)||[]).length;if(letters<3)return;let s=35-i*2+Math.min(25,letters)-digits*4;if(l===l.toUpperCase())s+=12;if(l.length>38)s-=12;if(s>best){best=s;merchant=l}});
  const date=parseDate(text);
  let total=null,totalScore=-999,tax=0;
  lines.forEach((l,i)=>{const vals=moneyVals(l);if(!vals.length)return;const u=l.toUpperCase();for(const v of vals){let s=v/1000;if(/\bTOTAL\b|A PAGAR|IMPORTE TOTAL|TOTAL EUR|TOTAL €/.test(u))s+=140;if(/SUBTOTAL|BASE IMPONIBLE/.test(u))s-=70;if(/\bIVA\b|VAT|TAX|CUOTA/.test(u))s-=50;if(/CAMBIO|ENTREGADO|EFECTIVO RECIBIDO/.test(u))s-=80;if(i>lines.length*.45)s+=10;if(s>totalScore){totalScore=s;total=v}}if(/\bIVA\b|VAT|CUOTA/.test(u)){const v=vals[vals.length-1];if(v<(total||999999))tax=Math.max(tax,v)}})
  if(total===null){const all=lines.flatMap(moneyVals);if(all.length)total=Math.max(...all)}
  const itemNames=[];
  lines.forEach(l=>{const vals=moneyVals(l),u=l.toUpperCase();if(!vals.length||/TOTAL|SUBTOTAL|IVA|IMPORTE|CAMBIO|PAGO|TARJETA|EFECTIVO|BASE/.test(u))return;const name=cleanLine(l.replace(/\d{1,6}[.,]\d{2}.*/,""));if(name.length>=3&&/[A-Za-zÁÉÍÓÚÜÑ]/.test(name)&&!itemNames.includes(name))itemNames.push(name)});
  const concept=itemNames.slice(0,3).join(" + ")||(merchant?`Compra en ${merchant}`:"");
  const taxId=(text.match(/\b(?:CIF|NIF|NIE)\s*[:\-]?\s*([A-Z0-9\-]{7,12})/i)||[])[1]||"";
  const invoiceNo=(text.match(/\b(?:FACTURA|TICKET|RECIBO|N[ºO]\.?|NUM(?:ERO)?)\s*[:#\-]?\s*([A-Z0-9\-\/]{3,20})/i)||[])[1]||"";
  const cat=inferCategory(`${merchant} ${concept}`);
  const conf={
    merchant:merchant?Math.min(96,55+(best>45?25:10)):20,
    date:date?94:25,amount:total!==null?(totalScore>100?98:76):20,tax:tax>0?82:35,concept:itemNames.length?76:(merchant?55:25)
  };
  return {merchant,date,amount:total??"",tax:tax||0,concept,category:cat,taxId,invoiceNo,confidence:conf,overall:Math.round((Number(baseConf||0)+conf.merchant+conf.date+conf.amount+conf.concept)/5)}
}
function inferCategory(s){
  const x=s.toLowerCase();
  if(/mercadona|carrefour|supermerc|aliment|restaur|bar\b|caf[eé]|bodega|turco|pizzer|burger|comida|panader/.test(x))return "Alimentación";
  if(/repsol|cepsa|bp\b|gasolin|combust|parking|taller|neumatic|auto/.test(x))return "Vehículo";
  if(/farmac|clinica|m[eé]dic|salud|dent/.test(x))return "Salud";
  if(/amazon|mediamarkt|pccomponent|electr[oó]nic|informat|telefon/.test(x))return "Tecnología";
  if(/leroy|ikea|ferreter|hogar|mueble/.test(x))return "Hogar";
  if(/cine|teatro|ocio|hotel|viaje/.test(x))return "Ocio";
  if(/colegio|academ|libro|educa/.test(x))return "Educación";
  if(/luz|agua|telefon|internet|seguro|servicio/.test(x))return "Servicios";
  return "Otros"
}
function confText(n){n=Math.round(Number(n||0));return `Confianza ${n}%`}
function renderReview(f){
  lastFields=f;$("ocrMerchant").value=f.merchant||"";$("ocrDate").value=f.date||new Date().toISOString().slice(0,10);$("ocrAmount").value=f.amount??"";$("ocrTax").value=f.tax??0;$("ocrConcept").value=f.concept||"";$("ocrCategory").value=f.category||"Otros";$("ocrTaxId").value=f.taxId||"";$("ocrInvoiceNo").value=f.invoiceNo||"";
  $("confMerchant").textContent=confText(f.confidence.merchant);$("confDate").textContent=confText(f.confidence.date);$("confAmount").textContent=confText(f.confidence.amount);$("confTax").textContent=confText(f.confidence.tax);$("confConcept").textContent=confText(f.confidence.concept);$("ocrOverallConfidence").textContent=`OCR ${f.overall}%`;$("ocrRawText").textContent=ocrText;visibleReview(true)
}
async function runOCR(){
  if(!correctedBlob||!window.Tesseract){ocrStatus("OCR no disponible.");return}
  const oc=makeOcrCanvas();ocrStatus("Leyendo ticket... 0%");$("ocrBtn").disabled=true;
  try{
    const r=await Tesseract.recognize(oc,"spa+eng",{logger:m=>{if(m.progress)ocrStatus(`OCR ${Math.round(m.progress*100)}% · ${m.status||""}`)}});
    ocrText=r.data.text||"";ocrConfidence=Number(r.data.confidence||0);const f=extractReceipt(ocrText,ocrConfidence);renderReview(f);ocrStatus("OCR completado. Revisa los datos detectados.");status("Documento procesado. Revisa los datos antes de guardar.")
  }catch(err){console.error(err);ocrStatus("No se pudo completar OCR. Puedes repetirlo o introducir los datos manualmente.");status("OCR falló; el documento puede seguir adjuntándose.")}
  finally{$("ocrBtn").disabled=false}
}

async function loadFile(f){
  if(!f)return;resetScanner();file=f;status("Cargando imagen...");
  const im=new Image();im.onload=async()=>{const scale=Math.min(1,1800/Math.max(im.naturalWidth,im.naturalHeight));src.width=Math.round(im.naturalWidth*scale);src.height=Math.round(im.naturalHeight*scale);src.style.width="100%";sctx.drawImage(im,0,0,src.width,src.height);defaultPts();status("Detectando bordes automáticamente...");await autoEdges();await correctPerspective(true)};im.onerror=()=>status("No se pudo abrir la imagen.");im.src=URL.createObjectURL(f)
}
$("cameraFile").onchange=e=>loadFile(e.target.files[0]);
$("galleryFile").onchange=e=>loadFile(e.target.files[0]);
$("autoEdges").onclick=()=>autoEdges();
$("perspective").onclick=()=>correctPerspective(false);
$("ocrBtn").onclick=()=>runOCR();
$("useOcrData").onclick=()=>{
  if(!file||!correctedBlob)return;
  const fields={merchant:$("ocrMerchant").value.trim(),date:$("ocrDate").value,amount:$("ocrAmount").value,tax:$("ocrTax").value,concept:$("ocrConcept").value.trim(),category:$("ocrCategory").value};
  const scan={original:file,corrected:correctedBlob,text:ocrText,confidence:ocrConfidence,fields:{...lastFields,...fields,taxId:$("ocrTaxId").value,invoiceNo:$("ocrInvoiceNo").value}};
  window.gasto360Cloud.useScanData(fields,scan)
};
resetScanner();
})();