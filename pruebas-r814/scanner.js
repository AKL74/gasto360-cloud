(()=>{
const $=id=>document.getElementById(id);
const src=$("srcCanvas"),ov=$("overlayCanvas"),dst=$("dstCanvas"),reviewCanvas=$("reviewCanvas"),sctx=src.getContext("2d"),octx=ov.getContext("2d");
let file=null,pts=[],drag=-1,correctedBlob=null,ocrText="",ocrConfidence=0,lastFields={},lastExtraction=null,scanSubmissionId=null,saving=false;
let cropConfidence=0,cropSample=null,knownMerchants=[],ocrDiagnostics=null;let mediaStream=null,cameraStarting=false,currentFacing="environment";
let captureMode="galería",sourceDimensions={width:0,height:0},liveCaptureMode="fotograma";

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
  file=null;pts=[];drag=-1;correctedBlob=null;sourceDimensions={width:0,height:0};ocrText="";ocrConfidence=0;ocrDiagnostics=null;lastFields={};lastExtraction=null;scanSubmissionId=crypto.randomUUID?crypto.randomUUID():String(Date.now());saving=false;cropConfidence=0;
  src.width=src.height=ov.width=ov.height=dst.width=dst.height=reviewCanvas.width=reviewCanvas.height=1;
  stopCamera();$("galleryFile").value="";if($("nativeCameraFile"))$("nativeCameraFile").value="";
  if($("captureMeta"))$("captureMeta").hidden=true;$("scanDuplicateWarning").hidden=true;$("saveScanBtn").disabled=false;$("saveScanBtn").textContent="Guardar resultado local";$("captureLauncher").hidden=false;$("liveCameraPanel").hidden=true;$("cameraPermissionHelp").hidden=true;setStep(1)
}


async function waitCV(ms=6000){const t=Date.now();while(Date.now()-t<ms){if(window.cv&&cv.Mat)return true;await sleep(120)}return false}
function sortPts(a){const sum=a.map(p=>p.x+p.y),dif=a.map(p=>p.x-p.y);return[a[sum.indexOf(Math.min(...sum))],a[dif.indexOf(Math.max(...dif))],a[sum.indexOf(Math.max(...sum))],a[dif.indexOf(Math.min(...dif))]]}
function angleScore(p){
  p=sortPts(p);let score=0;
  for(let i=0;i<4;i++){const a=p[(i+3)%4],b=p[i],c=p[(i+1)%4],v1={x:a.x-b.x,y:a.y-b.y},v2={x:c.x-b.x,y:c.y-b.y};const den=Math.hypot(v1.x,v1.y)*Math.hypot(v2.x,v2.y)||1;score+=1-Math.min(1,Math.abs((v1.x*v2.x+v1.y*v2.y)/den))}
  return score/4
}
function polyArea(p){let a=0;for(let i=0;i<p.length;i++){const j=(i+1)%p.length;a+=p[i].x*p[j].y-p[j].x*p[i].y}return Math.abs(a/2)}
function scoreQuad(p,w,h){return window.Gasto360ScanR86.scoreQuad(sortPts(p),w,h,cropSample)}
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
  let rgba,gray,blur,canny,thr,hierarchy,contours;const candidates=[];cropSample=null;
  try{
    const small=document.createElement("canvas"),factor=Math.min(1,1400/Math.max(src.width,src.height));small.width=Math.max(2,Math.round(src.width*factor));small.height=Math.max(2,Math.round(src.height*factor));const dc=small.getContext("2d",{willReadFrequently:true});dc.drawImage(src,0,0,small.width,small.height);cropSample={width:small.width,height:small.height,data:dc.getImageData(0,0,small.width,small.height).data};rgba=cv.imread(small);gray=new cv.Mat();blur=new cv.Mat();canny=new cv.Mat();thr=new cv.Mat();hierarchy=new cv.Mat();contours=new cv.MatVector();
    cv.cvtColor(rgba,gray,cv.COLOR_RGBA2GRAY);cv.equalizeHist(gray,gray);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    for(const mode of ["canny","threshold"]){
      contours.delete();contours=new cv.MatVector();hierarchy.delete();hierarchy=new cv.Mat();
      if(mode==="canny"){cv.Canny(blur,canny,40,140);cv.findContours(canny,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE)}
      else{cv.adaptiveThreshold(blur,thr,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,31,9);cv.findContours(thr,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE)}
      for(let i=0;i<contours.size();i++){
        const c=contours.get(i),area=Math.abs(cv.contourArea(c));if(area<small.width*small.height*.003){c.delete();continue}
        const ap=new cv.Mat();cv.approxPolyDP(c,ap,.018*cv.arcLength(c,true),true);
        if(ap.rows===4){const q=[];for(let r=0;r<4;r++)q.push({x:ap.intPtr(r,0)[0]*src.width/small.width,y:ap.intPtr(r,0)[1]*src.height/small.height});candidates.push({q:sortPts(q),score:scoreQuad(q,src.width,src.height)})}
        ap.delete();c.delete()
      }
    }
    // Fallback para papel curvado o bordes poco contrastados:
    // máscara de papel claro, cierre morfológico y rectángulo envolvente.
    if(!candidates.some(c=>c.score>=.78)){
      let paperMask,kernel,paperContours,paperHierarchy;
      try{
        paperMask=new cv.Mat(small.height,small.width,cv.CV_8UC1);
        for(let i=0,j=0;i<cropSample.data.length;i+=4,j++){
          const r=cropSample.data[i],g=cropSample.data[i+1],b=cropSample.data[i+2];
          const value=Math.max(r,g,b),minValue=Math.min(r,g,b);
          const saturation=value?255*(value-minValue)/value:0;
          paperMask.data[j]=(value>122&&saturation<74)?255:0;
        }
        kernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,7));
        cv.morphologyEx(paperMask,paperMask,cv.MORPH_CLOSE,kernel);
        paperContours=new cv.MatVector();paperHierarchy=new cv.Mat();
        cv.findContours(paperMask,paperContours,paperHierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
        for(let i=0;i<paperContours.size();i++){
          const c=paperContours.get(i),area=Math.abs(cv.contourArea(c));
          if(area>=small.width*small.height*.003&&area<=small.width*small.height*.75){
            const r=cv.boundingRect(c),rx=src.width/small.width,ry=src.height/small.height;
            const q=[{x:r.x*rx,y:r.y*ry},{x:(r.x+r.width)*rx,y:r.y*ry},
                     {x:(r.x+r.width)*rx,y:(r.y+r.height)*ry},{x:r.x*rx,y:(r.y+r.height)*ry}];
            const score=scoreQuad(q,src.width,src.height);
            if(score>=.56)candidates.push({q,score:score-.025});
          }
          c.delete();
        }
      }catch(e){console.warn("Segmentación de papel no concluyente",e)}
      finally{[paperMask,kernel,paperHierarchy].forEach(x=>{try{x&&x.delete()}catch{}});try{paperContours&&paperContours.delete()}catch{}}
    }
    // R8.14: detección alternativa del papel (fondo oscuro, silla o mesa).
    // Propuestas de imagen completa SIN agrandar artificialmente cada letra.
    // Se premia una tira vertical clara cerca del centro, frente a otros papeles laterales.
    {
      let mask=null,kclose=null,kopen=null,contoursPaper=null,hierPaper=null;
      try{
        mask=new cv.Mat(small.height,small.width,cv.CV_8UC1);
        kclose=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(5,7));
        kopen=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(3,3));
        const cw=small.width,ch=small.height,allPixels=cw*ch,im=cropSample.data;
        for(const threshold of [170,190,210]){
          for(let i=0,j=0;i<im.length;i+=4,j++){
            const r=im[i],g=im[i+1],b=im[i+2];
            const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
            const saturation=hi?255*(hi-lo)/hi:0;
            mask.data[j]=(hi>=threshold&&saturation<85)?255:0;
          }
          cv.morphologyEx(mask,mask,cv.MORPH_CLOSE,kclose);
          cv.morphologyEx(mask,mask,cv.MORPH_OPEN,kopen);
          contoursPaper=new cv.MatVector();hierPaper=new cv.Mat();
          cv.findContours(mask,contoursPaper,hierPaper,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
          for(let i=0;i<contoursPaper.size();i++){
            const c=contoursPaper.get(i),r=cv.boundingRect(c);
            const shapeArea=Math.abs(cv.contourArea(c));
            const ratio=r.height/Math.max(1,r.width),frameShare=shapeArea/allPixels,fill=shapeArea/Math.max(1,r.width*r.height);
            if(r.width>cw*.065&&r.height>ch*.20&&ratio>1.55&&ratio<9&&frameShare>.014&&frameShare<.55&&fill>.37){
              const center=1-Math.min(1,Math.abs(r.x+r.width*.5-cw*.5)/(cw*.5));
              const tall=Math.min(1,Math.max(0,(ratio-1.5)/2.0));
              const score=.63+.10*tall+.12*center+.10*Math.min(1,frameShare*6);
              const rx=src.width/cw,ry=src.height/ch;
              const q=[{x:r.x*rx,y:r.y*ry},{x:(r.x+r.width)*rx,y:r.y*ry},
                       {x:(r.x+r.width)*rx,y:(r.y+r.height)*ry},{x:r.x*rx,y:(r.y+r.height)*ry}];
              candidates.push({q,score:Math.min(.94,score),method:"papel"});
            }
            c.delete();
          }
          contoursPaper.delete();contoursPaper=null;hierPaper.delete();hierPaper=null;
        }
      }catch(e){console.warn("R8.14: segmentación alternativa no disponible",e)}
      finally{[mask,kclose,kopen,contoursPaper,hierPaper].forEach(m=>{try{m&&m.delete()}catch{}})}
    }
    candidates.sort((a,b)=>b.score-a.score);
    if(candidates.length&&candidates[0].score>=.56){pts=candidates[0].q;cropConfidence=candidates[0].score;drawOverlay();setCropBanner(candidates[0].method==="papel"?"Ticket propuesto por contraste de papel. Comprueba las cuatro esquinas antes de continuar.":cropConfidence>.78?"Posible ticket aislado. Comprueba los bordes.":"Comprueba que los 4 puntos rodean el ticket y no la carpeta.",cropConfidence>.78?"ok":"warn")}
    else{defaultPts();setCropBanner("No encontramos los 4 bordes con suficiente seguridad. Ajusta los puntos manualmente.","warn")}
  }catch(e){console.error(e);defaultPts();setCropBanner("La detección automática no fue concluyente. Ajusta los 4 puntos.","warn")}
  finally{[rgba,gray,blur,canny,thr,hierarchy].forEach(x=>{try{x&&x.delete()}catch{}});try{contours&&contours.delete()}catch{}}
}
function setCropBanner(msg,kind="ok"){$("qualityBanner").hidden=false;$("qualityBanner").className="quality-banner"+(kind==="ok"?"":` ${kind}`);$("qualityBanner").textContent=msg}

function imageQuality(){
  if(!window.cv||!cv.Mat)return {blur:null,brightness:null};
  let a,g,lap;try{const qc=document.createElement("canvas"),f=Math.min(1,900/Math.max(src.width,src.height));qc.width=Math.max(2,Math.round(src.width*f));qc.height=Math.max(2,Math.round(src.height*f));qc.getContext("2d").drawImage(src,0,0,qc.width,qc.height);a=cv.imread(qc);g=new cv.Mat();lap=new cv.Mat();cv.cvtColor(a,g,cv.COLOR_RGBA2GRAY);const mean=cv.mean(g)[0];cv.Laplacian(g,lap,cv.CV_64F);const m=new cv.Mat(),sd=new cv.Mat();cv.meanStdDev(lap,m,sd);const variance=sd.doubleAt(0,0)**2;m.delete();sd.delete();return {blur:variance,brightness:mean}}catch{return {blur:null,brightness:null}}finally{[a,g,lap].forEach(x=>{try{x&&x.delete()}catch{}})}
}
function clearCaptureState(){
  file=null;pts=[];drag=-1;correctedBlob=null;ocrText="";ocrConfidence=0;ocrDiagnostics=null;lastFields={};lastExtraction=null;
  scanSubmissionId=crypto.randomUUID?crypto.randomUUID():String(Date.now());
  saving=false;cropConfidence=0;
  $("scanDuplicateWarning").hidden=true;
  $("saveScanBtn").disabled=false;$("saveScanBtn").textContent="Guardar resultado local";
}
async function decodeCaptureToSource(f){
  let bitmap=null;
  if("createImageBitmap" in window){
    try{bitmap=await createImageBitmap(f,{imageOrientation:"from-image"})}catch(e){console.warn("createImageBitmap fallo",e)}
  }
  if(bitmap){
    sourceDimensions={width:bitmap.width,height:bitmap.height};
    const scale=Math.min(1,3800/Math.max(bitmap.width,bitmap.height));
    src.width=Math.max(2,Math.round(bitmap.width*scale));src.height=Math.max(2,Math.round(bitmap.height*scale));
    sctx.clearRect(0,0,src.width,src.height);sctx.drawImage(bitmap,0,0,src.width,src.height);
    try{bitmap.close()}catch{}
    return;
  }
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error("No se pudo leer la foto"));r.readAsDataURL(f)});
  await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{sourceDimensions={width:im.naturalWidth,height:im.naturalHeight};
    const scale=Math.min(1,3800/Math.max(im.naturalWidth,im.naturalHeight));src.width=Math.max(2,Math.round(im.naturalWidth*scale));src.height=Math.max(2,Math.round(im.naturalHeight*scale));sctx.clearRect(0,0,src.width,src.height);sctx.drawImage(im,0,0,src.width,src.height);resolve()};im.onerror=()=>reject(new Error("Formato de imagen no compatible"));im.src=dataUrl})
}

function stopCamera(){
  if(mediaStream){
    for(const track of mediaStream.getTracks()){try{track.stop()}catch{}}
    mediaStream=null;
  }
  const v=$("liveVideo");
  if(v){try{v.pause()}catch{};v.srcObject=null}
  cameraStarting=false;
  if($("captureLiveBtn"))$("captureLiveBtn").disabled=true;
}
async function enumerateRearCameraSupport(){
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    const vids=devices.filter(d=>d.kind==="videoinput");
    $("switchCameraBtn").hidden=vids.length<2;
  }catch{$("switchCameraBtn").hidden=true}
}
async function startCamera(){
  if(cameraStarting)return;
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    $("cameraPermissionHelp").hidden=false;
    window.gasto360Cloud.toast("Este navegador no permite cámara integrada. Usa Elegir de galería.","warn",6000);
    return;
  }
  cameraStarting=true;
  stopCamera();
  cameraStarting=true;
  $("captureLauncher").hidden=true;
  $("liveCameraPanel").hidden=false;
  $("cameraPermissionHelp").hidden=true;
  $("cameraStatus").textContent="Solicitando acceso a la cámara...";
  $("captureLiveBtn").disabled=true;
  try{
    let stream;
    const preferred={audio:false,video:{facingMode:{ideal:currentFacing},width:{ideal:2560},height:{ideal:1920}}};
    try{
      stream=await navigator.mediaDevices.getUserMedia(preferred);
    }catch(first){
      console.warn("preferred camera constraints failed",first);
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});
    }
    mediaStream=stream;
    const video=$("liveVideo");
    video.srcObject=stream;
    await new Promise((resolve,reject)=>{
      const ready=()=>{cleanup();resolve()};
      const fail=()=>{cleanup();reject(new Error("No se pudo iniciar la vista previa"))};
      const cleanup=()=>{video.removeEventListener("loadedmetadata",ready);video.removeEventListener("error",fail)};
      video.addEventListener("loadedmetadata",ready,{once:true});
      video.addEventListener("error",fail,{once:true});
      if(video.readyState>=1){cleanup();resolve()}
    });
    await video.play();
    $("cameraStatus").textContent="Vista integrada: "+video.videoWidth+" × "+video.videoHeight+" px. Para mejor nitidez usa la cámara del teléfono.";
    if(video.videoWidth*video.videoHeight<1600000)window.gasto360Cloud.toast("Vista integrada limitada a "+video.videoWidth+" × "+video.videoHeight+". Recomendamos Cámara del teléfono.","warn",6500);
    $("captureLiveBtn").disabled=false;
    await enumerateRearCameraSupport();
  }catch(err){
    console.error(err);
    stopCamera();
    $("liveCameraPanel").hidden=true;
    $("captureLauncher").hidden=false;
    $("cameraPermissionHelp").hidden=false;
    const denied=err?.name==="NotAllowedError"||err?.name==="PermissionDeniedError";
    window.gasto360Cloud.toast(denied?"Debes permitir la cámara a Gasto360 en Samsung Internet.":"No pudimos abrir la cámara: "+(err.message||err),"error",7000);
  }finally{
    cameraStarting=false;
  }
}
async function captureLiveFrame(){
  const video=$("liveVideo");
  const w=video.videoWidth,h=video.videoHeight;
  if(!mediaStream||!w||!h){window.gasto360Cloud.toast("La cámara todavía no está lista.","warn");return}
  $("captureLiveBtn").disabled=true;
  liveCaptureMode="fotograma";
  $("cameraStatus").textContent="Capturando ticket...";
  let blob=null;
  if(window.ImageCapture&&mediaStream.getVideoTracks().length){
    try{blob=await new ImageCapture(mediaStream.getVideoTracks()[0]).takePhoto();if(blob)liveCaptureMode="foto nativa del flujo"}catch(e){console.warn("Foto de máxima resolución no disponible; usamos fotograma",e)}
  }
  if(!blob){
    liveCaptureMode="fotograma";
    if(w*h<1600000)window.gasto360Cloud.toast("La cámara integrada ofrece solo "+w+" × "+h+" píxeles. Para una imagen nítida utiliza Cámara del teléfono.","warn",8500);
    const c=document.createElement("canvas");c.width=w;c.height=h;
    const ctx=c.getContext("2d",{alpha:false});ctx.drawImage(video,0,0,w,h);
    blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error("No se pudo crear la fotografía")),"image/jpeg",.96));
  }
  const mime=blob.type||"image/jpeg",ext=mime.includes("png")?"png":"jpg";
  const captured=new File([blob],"ticket_"+new Date().toISOString().replace(/[:.]/g,"-")+"."+ext,{type:mime,lastModified:Date.now()});
  stopCamera();
  $("liveCameraPanel").hidden=true;
  $("captureLauncher").hidden=false;
  await loadFile(captured,liveCaptureMode==="foto nativa del flujo"?"cámara integrada / ImageCapture":"cámara integrada / fotograma de vídeo");
}
async function switchCamera(){
  currentFacing=currentFacing==="environment"?"user":"environment";
  stopCamera();
  await startCamera();
}

async function loadFile(f,origin="galería"){
  if(!f){window.gasto360Cloud.toast("La cámara no entregó ninguna foto. Inténtalo de nuevo.","warn");return}
  clearCaptureState();
  file=f;captureMode=origin;
  setStep(2);
  $("cropHint").innerHTML='<span class="capture-return-status"><span class="mini-spinner"></span>Foto recibida. Preparando encuadre...</span>';
  $("qualityBanner").hidden=true;
  try{
    await decodeCaptureToSource(f);
    const orig=sourceDimensions.width*sourceDimensions.height;
    const notice=[];
    if(orig<1800000)notice.push("Resolución original baja: acerca el móvil y activa cámara nativa");
    if(origin.includes("fotograma"))notice.push("Captura de vídeo: suele tener menos detalle que la cámara nativa");
    const meta=$("captureMeta");
    if(meta){
      meta.hidden=false;
      meta.textContent="Origen: "+origin+" · Original: "+sourceDimensions.width+" × "+sourceDimensions.height+
        " px · Procesamiento: "+src.width+" × "+src.height+" px · Archivo: "+(f.size/1048576).toFixed(2)+" MB"+
        (notice.length?" · "+notice.join(". "):"");
    }
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
$("liveCameraBtn").onclick=()=>startCamera();
$("captureLiveBtn").onclick=()=>captureLiveFrame();
$("cancelLiveCamera").onclick=()=>{stopCamera();$("liveCameraPanel").hidden=true;$("captureLauncher").hidden=false;$("cameraStatus").textContent="Preparando cámara trasera..."};
$("switchCameraBtn").onclick=()=>switchCamera();
$("galleryFile").addEventListener("click",e=>{e.currentTarget.value=""});
$("galleryFile").addEventListener("change",e=>loadFile(e.currentTarget.files&&e.currentTarget.files[0],"galería"));
$("nativeCameraFile").addEventListener("click",e=>{e.currentTarget.value=""});
$("nativeCameraFile").addEventListener("change",e=>loadFile(e.currentTarget.files&&e.currentTarget.files[0],"cámara nativa del teléfono"));
$("retakeBtn").onclick=reset;$("autoEdges").onclick=autoEdges;$("acceptCrop").onclick=()=>{
  if(pts.length===4){const p=sortPts(pts),wid=Math.max(Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),Math.hypot(p[2].x-p[3].x,p[2].y-p[3].y));if(wid<400)window.gasto360Cloud.toast("El ticket tiene solo "+Math.round(wid)+" píxeles de ancho. Una foto más cercana ayudará a leer las letras.","warn",5500);}
  const area=pts.length===4?polyArea(sortPts(pts))/Math.max(1,src.width*src.height):1;
  if(cropConfidence<.5&&area>.65){
    setCropBanner("El recuadro rodea casi toda la fotografía, no el ticket. Ajusta las cuatro esquinas al papel antes de continuar.","warn");
    window.gasto360Cloud.toast("El encuadre sigue siendo demasiado amplio. Ajusta los cuatro puntos al ticket.","warn",6500);
    return;
  }
  processScan();
};

function canvasBlob(c,q=.94){return new Promise(res=>c.toBlob(res,"image/jpeg",q))}
async function correctPerspective(){
  const p=sortPts(pts),dist=(x,y)=>Math.hypot(x.x-y.x,x.y-y.y),w=Math.max(400,Math.round(Math.max(dist(p[0],p[1]),dist(p[3],p[2])))),h=Math.max(500,Math.round(Math.max(dist(p[0],p[3]),dist(p[1],p[2]))));
  if(!(await waitCV(2000))){const x=Math.max(0,Math.floor(Math.min(...p.map(v=>v.x)))),y=Math.max(0,Math.floor(Math.min(...p.map(v=>v.y)))),ww=Math.min(src.width-x,Math.ceil(Math.max(...p.map(v=>v.x))-x)),hh=Math.min(src.height-y,Math.ceil(Math.max(...p.map(v=>v.y))-y));dst.width=Math.max(1,ww);dst.height=Math.max(1,hh);dst.getContext("2d").drawImage(src,x,y,ww,hh,0,0,dst.width,dst.height);correctedBlob=await canvasBlob(dst);return}
  let a,sp,dp,M,out;try{a=cv.imread(src);sp=cv.matFromArray(4,1,cv.CV_32FC2,[p[0].x,p[0].y,p[1].x,p[1].y,p[2].x,p[2].y,p[3].x,p[3].y]);dp=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,w-1,0,w-1,h-1,0,h-1]);M=cv.getPerspectiveTransform(sp,dp);out=new cv.Mat();cv.warpPerspective(a,out,M,new cv.Size(w,h),cv.INTER_CUBIC,cv.BORDER_REPLICATE,new cv.Scalar());dst.width=w;dst.height=h;cv.imshow(dst,out)}finally{[a,sp,dp,M,out].forEach(x=>{try{x&&x.delete()}catch{}})}
  correctedBlob=await canvasBlob(dst)
}
function updateProgress(p,title,detail){$("ocrProgressBar").style.width=`${clamp(p,0,100)}%`;$("processingTitle").textContent=title;$("processingDetail").textContent=detail}
async function processScan(){
  setStep(3);updateProgress(8,"Corrigiendo perspectiva...","Alineando el documento");
  try{await correctPerspective();updateProgress(25,"Mejorando legibilidad...","Contraste, escala y limpieza");try{knownMerchants=await window.gasto360Cloud.getKnownMerchants()}catch(e){console.warn("Sin comercios previos",e);knownMerchants=[]}await runOCR();renderFinalReview();setStep(4)}catch(e){console.error(e);window.gasto360Cloud.toast("Error en el análisis: "+String(e?.message||e).slice(0,180),"error",8500);setStep(2)}
}

function makeOcrCanvas(mode="gray"){
  const c=document.createElement("canvas"),ctx=c.getContext("2d"),scale=Math.min(3.2,3200/Math.max(dst.width,dst.height),Math.max(1,1100/Math.max(1,dst.width)));c.width=Math.round(dst.width*scale);c.height=Math.round(dst.height*scale);ctx.drawImage(dst,0,0,c.width,c.height);
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
function extractReceipt(text,baseConf){return window.Gasto360ScanR86.extract(text,baseConf,knownMerchants)}
function extractionScore(f){return (f.merchant?30:0)+(f.date?20:0)+(f.amount!==""?30:0)+(f.tax>0?8:0)+(f.items?.length?15:0)+(f.taxId?5:0)+(f.invoiceNo?5:0)+f.overall/10}
async function recognizeCanvas(c,label,base,span){
  const blob=await canvasBlob(c,.95);let last=0;
  const r=await Tesseract.recognize(blob,"spa+eng",{logger:m=>{if(m.progress){last=m.progress;updateProgress(base+m.progress*span,`Leyendo ticket (${label})...`,`${Math.round(m.progress*100)}%`)}}});
  return {text:r.data.text||"",confidence:Number(r.data.confidence||0)}
}
async function runOCR(){
  updateProgress(27,"Reconociendo texto…","Lectura en varias zonas y tratamientos de imagen");
  if(!window.Gasto360OCRR814)throw new Error("No se cargó el motor OCR R8.14. Recarga la página.");
  const r=await window.Gasto360OCRR814.run(dst,(raw,conf,known)=>window.Gasto360ScanR86.extract(raw,conf,known),knownMerchants,updateProgress);
  const analysis=window.Gasto360DesgloseR814.analyze(r.diagnostics?.passes||[],r.fields);
  r.fields.items=analysis.items;
  r.fields.desglose=analysis;
  if(analysis.items.length){
    r.fields.flags=(r.fields.flags||[]).filter(x=>!x.includes("No se han reconocido productos individuales."));
  }
  if(analysis.fiscal.status==="validado"){
    r.fields.tax=analysis.fiscal.tax;r.fields.base=analysis.fiscal.base;
    r.fields.fiscalValidated=true;
    r.fields.confidence.tax=analysis.fiscal.inferredRows?82:94;
    r.fields.flags=(r.fields.flags||[]).filter(x=>!x.includes("IVA no verificado"));
  }else if(!r.fields.fiscalValidated){r.fields.tax=null;r.fields.base=null;}
  ocrText=r.text||"";ocrConfidence=r.confidence;ocrDiagnostics=r.diagnostics;
  lastExtraction=r.fields;lastFields=r.fields;
  await sleep(120);
}
function confClass(n){return n>=85?"good":n>=60?"warn":"bad"}
function setField(id,conf){const el=$(id);el.classList.remove("good","warn","bad");el.classList.add(confClass(conf))}
function confText(n){return `Confianza ${Math.round(Number(n||0))}%`}
function chips(id,values,selected,onClick,fmt=x=>String(x)){
  const host=$(id);host.innerHTML="";for(const v of values.slice(0,5)){const b=document.createElement("button");b.type="button";b.className="candidate-chip"+(String(v)===String(selected)?" selected":"");b.textContent=fmt(v);b.onclick=()=>onClick(v);host.appendChild(b)}
}
function renderFinalReview(){
  const f=lastExtraction||{};$("ocrMerchant").value=f.merchant||"";$("ocrDate").value=f.date||"";$("ocrAmount").value=f.amount??"";$("ocrTax").value=f.tax??"";$("ocrConcept").value=f.concept||"";$("ocrCategory").value=f.category||"Otros";$("ocrPayment").value=f.payment||"Otro";$("ocrTaxId").value=f.taxId||"";$("ocrInvoiceNo").value=f.invoiceNo||"";
  $("confMerchant").textContent=confText(f.confidence?.merchant);$("confDate").textContent=confText(f.confidence?.date);$("confAmount").textContent=confText(f.confidence?.amount);$("confTax").textContent=confText(f.confidence?.tax);$("confConcept").textContent=confText(f.confidence?.concept);$("ocrOverallConfidence").textContent=`OCR ${Math.round(f.overall||0)}%`;
  setField("fieldMerchant",f.confidence?.merchant||0);setField("fieldDate",f.confidence?.date||0);setField("fieldAmount",f.confidence?.amount||0);setField("fieldTax",f.confidence?.tax||0);setField("fieldConcept",f.confidence?.concept||0);
  chips("merchantCandidates",(f.merchantCandidates||[]).map(x=>x.name),f.merchant,v=>{$("ocrMerchant").value=v;renderCandidateSelections()} );
  chips("amountCandidates",(f.amountCandidates||[]).filter((v,i,a)=>a.indexOf(v)===i),f.amount,v=>{$("ocrAmount").value=v;renderFiscalCheck();renderCandidateSelections()},v=>money(v));
  editingItems=false;renderItems();renderFiscalCheck();$("ocrRawText").textContent=ocrText;
  const d=ocrDiagnostics||{},attempts=d.passes||[],diag=$("ocrDiagnosticSummary");
  if(diag){
    const detected=attempts.map(p=>p.label+": "+p.characters+" caracteres ("+p.confidence+" % OCR)").join(" | ");
    const missing=["merchant","date","amount","payment"].filter(k=>k==="payment"?f.payment==="Otro":(f[k]===""||!f[k])).length;
    diag.textContent=attempts.length?(d.empty?"No se han reconocido caracteres legibles. Repite la foto o utiliza una imagen original de mayor resolución. ":missing?"OCR realizado, pero faltan "+missing+" datos principales. ":"OCR realizado. Revisa las cifras. ")+detected:"No se ejecutó ninguna lectura OCR.";
  }
  reviewCanvas.width=dst.width;reviewCanvas.height=dst.height;reviewCanvas.getContext("2d").drawImage(dst,0,0);
  const low=["merchant","date","amount","concept"].filter(k=>(f.confidence?.[k]||0)<75).length;const notices=f.flags||[];$("reviewSummary").textContent=notices.length?notices.join(" "):(low?"Hay "+low+" campos que conviene revisar.":"Comprueba los datos con el ticket antes de guardar.");
  updateProgress(100,"Lectura completada","Listo para revisar")
}
function renderCandidateSelections(){const f=lastExtraction||{};chips("merchantCandidates",(f.merchantCandidates||[]).map(x=>x.name),$("ocrMerchant").value,v=>{$("ocrMerchant").value=v;renderCandidateSelections()});chips("amountCandidates",(f.amountCandidates||[]).filter((v,i,a)=>a.indexOf(v)===i),Number($("ocrAmount").value),v=>{$("ocrAmount").value=v;renderFiscalCheck();renderCandidateSelections()},v=>money(v))}
let editingItems=false;
function renderItems(){
 const f=lastExtraction||{},items=f.items||[],engine=window.Gasto360DesgloseR814;
 $("itemsTitle").textContent=items.length?items.length+" artículo"+(items.length===1?"":"s")+" identificado"+(items.length===1?"":"s"):"Sin artículos identificados";
 $("editItemsBtn").textContent=editingItems?"Terminar edición":"Editar desglose";
 $("addItemBtn").hidden=!editingItems;
 const n=v=>v===null||v===undefined?"":String(v);
 const row=(it,i)=>{
   const notices=it.reviewReasons||[],provisional=it.gross===null||notices.length>0;
   const checked=it.gross!==null&&!provisional;
   const name=escapeHtml(it.name),unit=it.unit==='kg'&&it.weightKg!==null?
    (it.weightKg+" kg × "+(it.unitPrice??'?')+" €/kg"):(it.quantity>1?(it.quantity+" ud × "+(it.unitPrice??'?')+" €"):"");
   const evidence=(it.evidence||[]).map(x=>escapeHtml(x.label+": "+x.raw)).join("<br>");
   if(!editingItems)return '<article class="purchase-item'+(provisional?' needs-review':'')+'">'+
    '<div class="purchase-item-head"><b>'+name+'</b><span class="status-tag '+(checked?'confirmed':'needs')+'">'+(checked?'Extraído':'Revisar')+'</span></div>'+
    '<div class="purchase-item-money"><span>'+(unit||'1 ud')+'</span><span>Bruto: <b>'+(it.gross!==null?money(it.gross):'Pendiente')+'</b></span></div>'+
    (it.discount>0?'<div class="item-discount">Descuento asociado: −'+money(it.discount)+'</div>':'')+
    '<div class="item-net">Neto: <strong>'+(it.net!==null?money(it.net):'Por confirmar')+'</strong></div>'+
    (notices.length?'<p class="item-warning">⚠ '+escapeHtml(notices.join(' '))+'</p>':'')+
    '<details><summary>Procedencia de la lectura</summary><div class="item-evidence">'+evidence+'</div></details></article>';
   const input=(key,value,type='text')=>'<label>'+({name:'Producto',quantity:'Cantidad',gross:'Importe bruto €',discount:'Descuento €'}[key])+
     '<input data-index="'+i+'" data-field="'+key+'" type="'+type+'" '+(type==='number'?'min="0" step="0.01" inputmode="decimal" ':'')+
     'value="'+escapeHtml(n(value))+'"></label>';
   return '<article class="purchase-item editing"><div class="purchase-item-edit">'+
    input('name',it.name)+input('quantity',it.quantity,'number')+input('gross',it.gross,'number')+input('discount',it.discount,'number')+
    '</div><div class="item-net">Neto: '+(it.net!==null?money(it.net):'Sin precio')+'</div>'+
    '<button type="button" class="light-btn delete-item" data-index="'+i+'">Quitar artículo</button>'+
    (it.reviewReasons?.length?'<p class="item-warning">'+escapeHtml(it.reviewReasons.join(' '))+'</p>':'')+'</article>';
 };
 $("itemsList").innerHTML=items.length?items.map(row).join(""):'<div class="empty">No hay productos confirmados. Puedes añadirlos manualmente.</div>';
 updateReconciliation();
 renderVatDetails();
}
function updateReconciliation(){
 const f=lastExtraction||{},api=window.Gasto360DesgloseR814,items=f.items||[];
 const paid=Number($("ocrAmount").value||0),sum=api.summary(items,paid);
 if(f.desglose)f.desglose.reconciliation=sum;
 const box=$("purchaseReconciliation");
 const status=sum.status==='cuadrado'?'✓ CUADRADO':'⚠ PENDIENTE DE REVISIÓN';
 box.className="purchase-reconciliation"+(sum.status==='cuadrado'?' ok':' pending');
 box.innerHTML='<b>'+status+'</b><div class="purchase-kpis">'+
  '<span>Bruto reconocido<br><strong>'+money(sum.grossKnown)+'</strong></span>'+
  '<span>Descuentos<br><strong>−'+money(sum.discounts)+'</strong></span>'+
  '<span>Neto reconocido<br><strong>'+money(sum.netKnown)+'</strong></span>'+
  '<span>Total del ticket<br><strong>'+(sum.total!==null?money(sum.total):'Pendiente')+'</strong></span></div>'+
  (sum.difference!==null&&sum.status!=='cuadrado'?'<p>Diferencia por comprobar: <strong>'+money(sum.difference)+'</strong>. '+
    (sum.unknown?'Hay '+sum.unknown+' artículo(s) con importe no legible.':'Revisa los importes y descuentos.')+'</p>':'')+
  (sum.suggestion?'<p class="unconfirmed-amount">El precio de '+escapeHtml(items.find(x=>x.id===sum.suggestion.itemId)?.name||'un artículo')+
    ' podría ser '+money(sum.suggestion.amount)+' por diferencia matemática. <b>No está leído del ticket.</b></p>'+
    '<button class="light-btn" type="button" id="confirmDifference">Confirmar manualmente '+money(sum.suggestion.amount)+'</button>':'');
 const note=$("itemsReviewNote");
 note.textContent="Las promociones sin signo negativo se interpretan como descuentos por su etiqueta. Revisa las cantidades y el importe que falta antes de aceptar el desglose. El resultado se guarda solo en esta sesión.";
 const b=$("confirmDifference");if(b)b.onclick=()=>{
  const suggested=sum.suggestion,idx=items.findIndex(x=>x.id===suggested.itemId);
  if(idx<0)return;
  if(!window.confirm("¿Has comprobado en el ticket que el importe de "+items[idx].name+" es "+money(suggested.amount)+"? No procede directamente del OCR."))return;
  const p=items[idx];p.gross=suggested.amount;p.net=api.round(p.gross-p.discount);
  p.manualReview=true;p.reviewReasons=["Importe confirmado manualmente; no leído por OCR."];
  renderItems();
 };
}
function renderVatDetails(){
 const data=lastExtraction?.desglose?.fiscal,host=$("taxBreakdownRows"),flag=$("taxBreakdownState"),warn=$("taxBreakdownWarning");
 if(!data){host.textContent="Sin desglose fiscal leído.";flag.textContent="Pendiente";warn.textContent="";return}
 flag.textContent=data.status==="validado"?"Cuadrado con el total":"No verificado";
 flag.className="breakdown-status "+(data.status==='validado'?'status-ok':'status-warn');
 const rows=(data.rows||[]).map(x=>'<tr><td>'+x.rate+' %</td><td>'+money(x.base)+'</td><td>'+money(x.vat)+'</td><td>'+money(x.gross)+'</td><td>'+(x.review?'Comprobar':'OCR')+'</td></tr>').join('');
 host.innerHTML=rows?'<div class="table-scroll"><table><thead><tr><th>Tipo</th><th>Base</th><th>IVA</th><th>Total</th><th>Origen</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
 (data.status==='validado'?'<p><strong>Base: '+money(data.base)+' · IVA: '+money(data.tax)+' · Total: '+money(data.gross)+'</strong></p>':''):'Sin tabla de IVA fiable.';
 warn.textContent=(data.warnings||[]).join(' ');
}
function escapeHtml(s){return String(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function renderFiscalCheck(){const f=lastExtraction||{},total=Number($("ocrAmount").value||0),tax=Number($("ocrTax").value||0),base=f.base;const box=$("fiscalCheck");if(base!==null&&base!==undefined&&tax>0&&total>0){const diff=Math.abs(base+tax-total);box.hidden=false;box.className="fiscal-check"+(diff<=.03?"":" warn");box.textContent=diff<=.03?`✓ Cuadre fiscal: ${money(base)} base + ${money(tax)} IVA = ${money(total)}`:`⚠ Revisa importes: base ${money(base)} + IVA ${money(tax)} no coincide con total ${money(total)}`}else box.hidden=true}
$("ocrAmount").oninput=()=>{renderFiscalCheck();updateReconciliation()};$("ocrTax").oninput=renderFiscalCheck;
$("repeatOcrBtn").onclick=async()=>{setStep(3);await runOCR();renderFinalReview();setStep(4)};
$("editItemsBtn").onclick=()=>{editingItems=!editingItems;renderItems()};
$("addItemBtn").onclick=()=>{
 if(!lastExtraction)return;
 lastExtraction.items.push({id:"manual-"+Date.now(),name:"Nuevo artículo",gross:null,discount:0,net:null,quantity:1,unit:"ud",unitPrice:null,weightKg:null,
  vatCode:null,vatRate:null,evidence:[{label:"manual",raw:"Añadido por el usuario"}],discountEvidence:[],reviewReasons:["Introducido manualmente."],manualReview:true});
 editingItems=true;renderItems();
};
$("itemsList").addEventListener("change",e=>{
 const input=e.target.closest("input[data-index][data-field]");if(!input||!lastExtraction)return;
 const i=Number(input.dataset.index),field=input.dataset.field,prev=lastExtraction.items[i];
 if(!prev)return;
 const candidate={...prev,[field]:input.value};
 try{
  const normalized=window.Gasto360DesgloseR814.normalizeEditable(candidate);
  lastExtraction.items[i]=normalized;renderItems();
 }catch(err){window.gasto360Cloud.toast("Revisa el artículo: "+err.message,"warn",6000);renderItems()}
});
$("itemsList").addEventListener("click",e=>{
 const b=e.target.closest("button.delete-item");if(!b||!lastExtraction)return;
 const i=Number(b.dataset.index);if(!Number.isInteger(i))return;
 lastExtraction.items.splice(i,1);renderItems();
});

function buildPayload(){
  const items=(lastExtraction?.items||[]).map(x=>({...x}));
   const desglose=lastExtraction?.desglose||null;
   if(desglose)desglose.reconciliation=window.Gasto360DesgloseR814.summary(items,Number($("ocrAmount").value||0));
   const fields={merchant:$("ocrMerchant").value.trim(),date:$("ocrDate").value,amount:Number($("ocrAmount").value),
    tax:$("ocrTax").value.trim()===""?null:Number($("ocrTax").value),
    concept:$("ocrConcept").value.trim(),category:$("ocrCategory").value,payment:$("ocrPayment").value,
    items,desgloseEstado:desglose?.reconciliation?.status||"pendiente",ivaEstado:desglose?.fiscal?.status||"pendiente"};
  const scan={original:file,corrected:correctedBlob,text:ocrText,confidence:ocrConfidence,fields:{...lastExtraction,...fields,scannerVersion:"R8.14",ocrDiagnostics,cropConfidence}};
  return {fields,scan,submissionId:scanSubmissionId}
}
async function doSave(force=false){
  if(saving)return;const checked=buildPayload().fields;if(!checked.merchant||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(checked.date)||!Number.isFinite(checked.amount)||checked.amount<=0){window.gasto360Cloud.toast("Revisa comercio, fecha e importe. No se guardarán valores supuestos.","warn",7000);return}saving=true;$("saveScanBtn").disabled=true;$("saveScanBtn").textContent="Guardando resultado de prueba...";
  try{
    const r=await window.gasto360Cloud.saveScannedExpense(buildPayload(),force);
    if(r.duplicate){$("scanDuplicateWarning").hidden=false;$("scanDuplicateExisting").innerHTML=r.rows.map(x=>`<div><b>${escapeHtml(x.merchant)}</b> · ${escapeHtml(x.date)} · ${money(x.amount)}</div>`).join("");$("scanDuplicateWarning").scrollIntoView({behavior:"smooth",block:"center"});return}
    if(!r.ok)throw new Error(r.error||"No se pudo guardar");
    window.gasto360Cloud.toast(r.pending?`Resultado registrado localmente, sin nube.`:"Resultado de prueba registrado localmente. Se perderá al cerrar la pestaña.",r.pending?"warn":"ok",6000);
    reset();window.gasto360Cloud.goHome()
  }catch(e){window.gasto360Cloud.toast("No se pudo guardar: "+e.message,"error",6000)}
  finally{saving=false;$("saveScanBtn").disabled=false;$("saveScanBtn").textContent="Guardar resultado local"}
}
$("saveScanBtn").onclick=()=>doSave(false);$("forceScanSave").onclick=()=>{ $("scanDuplicateWarning").hidden=true;doSave(true)};$("cancelScanDuplicate").onclick=()=>{$("scanDuplicateWarning").hidden=true};

["scannerExit","homeBtn","docsBtn","logout"].forEach(id=>{const el=$(id);if(el)el.addEventListener("click",()=>stopCamera())});
window.addEventListener("pagehide",()=>stopCamera());
window.addEventListener("beforeunload",()=>stopCamera());
$("downloadOcrDiagnostic").onclick=()=>{
  if(!ocrDiagnostics){window.gasto360Cloud.toast("Todavía no se ha ejecutado el reconocimiento.","warn");return}
  const report={version:"R8.14",createdAt:new Date().toISOString(),diagnostics:ocrDiagnostics,fields:lastExtraction,
    note:"Informe local: contiene texto reconocido del ticket. Revisa sus datos personales antes de compartirlo."};
  const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),link=document.createElement("a");
  link.href=url;link.download="diagnostico_ocr_gasto360_r814_"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
};
window.gasto360Scanner={reset,stopCamera,startCamera};
reset();
})();