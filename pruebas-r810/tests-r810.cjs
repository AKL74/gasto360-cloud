'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dir=__dirname,parser=require('./scanner-r86-core.js');
const source=fs.readFileSync(path.join(dir,'ocr-r87.js'),'utf8');
const scanner=fs.readFileSync(path.join(dir,'scanner.js'),'utf8');
const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
assert.match(scanner,/Gasto360OCRR810\.run\(dst/, 'scanner invoca motor correcto');
assert.match(source,/window\.Gasto360OCRR810\s*=/,'el motor exporta el nombre correcto');
assert.match(html,/<script src="\.\/ocr-r87\.js\?v=8\.10"><\/script>[\s\S]*<script src="\.\/scanner\.js\?v=8\.10"><\/script>/,'orden de script correcto');
assert.match(source,/cabecera:\[0,\.40\]/,'hay lectura de cabecera independiente');
assert.match(source,/centro:\[\.28,\.73\]/,'hay lectura de centro independiente');
assert.match(source,/pie:\[\.58,1\]/,'hay lectura de parte inferior independiente');
assert.ok(!/window\.Gasto360OCRR89/.test(scanner+source),'no quedan referencias a motor anterior');
const invalid=parser.extract('VENTA CONTADO\n04/11/2026\nIMP. : 42,48 EUR\nRECIBO PARA EL CLIENTE',73,[]);
assert.equal(invalid.merchant,'','no presentar palabras de datáfono como comercio');
assert.equal(invalid.amount,42.48);
assert.equal(invalid.payment,'Tarjeta');
const good=parser.extract('LIDL\n04/11/2026\nIMP. : 42,48 EUR\nVENTA CONTADO\nRECIBO PARA EL CLIENTE\nTotal oferta Lidl Plus: 6,93 EUR',73,[]);
assert.equal(good.merchant,'LIDL');
assert.equal(good.amount,42.48);
assert.ok(!good.amountCandidates.includes(6.93));
const original=parser.extract('LIDL\n04/11/2026\nMIEL DE FLORES 2,99\nTOTAL 42,48 EUR\nTARJETA',87,[]);
assert.equal(original.amount,42.48);
assert.equal(original.payment,'Tarjeta');
assert.equal(parser.extract('VENTA CONTADO\nFECHA 04/11/2026\nDESCUENTO LIDL PLUS 6,93',87,[]).merchant,'');

let calls=0,workerTerminated=false,parameters=[];
const fakeTexts=[
 'LIDL\nFECHA 04/11/2026\nDESCRIPCION\nMIEL DE FLORES 2,99',
 'DESCRIPCION\nMIEL DE FLORES 2,99\nZUMO NATURAL 3,09',
 'VENTA CONTADO\n04/11/2026\nIMP. : 42,48 EUR\nRECIBO PARA EL CLIENTE\nLIDL PLUS OFERTA 6,93 EUR',
 'LIDL SUPERMERCADOS SAU\n04/11/2026',
 'VENTA CONTADO\nIMP. : 42,48 EUR\nRECIBO PARA EL CLIENTE\nDESCUENTO 6,93 EUR'
];
const mockT={OEM:{LSTM_ONLY:1},
 createWorker:async()=>({
  setParameters:async x=>parameters.push(x),
  recognize:async()=>({data:{text:fakeTexts[calls++]||'',confidence:79}}),
  terminate:async()=>{workerTerminated=true}
 })
};
const mockDocument={createElement:()=>({
 width:1,height:1,
 getContext:()=>({
  fillRect(){},drawImage(){},putImageData(){},
  getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(4).fill(240)})
 })
})};
const sandbox={window:{},Tesseract:mockT,document:mockDocument,console,Math,Date,String,Number,Map,Set,JSON,Uint8ClampedArray,Uint32Array};
vm.runInNewContext(source,sandbox);
const engine=sandbox.window.Gasto360OCRR810;
assert.equal(typeof engine?.run,'function');
const canvas=engine.makeCanvas({width:380,height:1400},'natural','cabecera');
assert.ok(canvas.width>=1000,'cabecera debe ampliarse a resolución útil');
assert.ok(canvas.width*canvas.height<=2400000,'cabecera limita memoria');
(async()=>{
 const out=await engine.run({width:380,height:1400},parser.extract,[],()=>{});
 assert.equal(out.fields.merchant,'LIDL','recupera empresa de zona cabecera');
 assert.equal(out.fields.date,'2026-11-04','recupera fecha de cabecera');
 assert.equal(out.fields.amount,42.48,'recupera total del pie');
 assert.equal(out.fields.payment,'Tarjeta','recupera medio de pago del pie');
 assert.ok(out.diagnostics.passes.length>=3,'realiza al menos 3 zonas');
 assert.ok(out.text.includes('VENTA CONTADO'),'diagnóstico conserva texto sin confundir empresa');
 assert.equal(workerTerminated,true,'libera motor OCR');
 const passthrough=sandbox.window.Gasto360OCRR810.merge([{label:'cabecera',text:'VENTA CONTADO',confidence:42,fields:invalid}]);
 assert.equal(passthrough.fields.merchant,'','la fusión tampoco inventa comercio');
 console.log('Gasto360 R8.10: pruebas de zonas, coherencia de módulos y campos críticos OK');
})().catch(e=>{console.error(e);process.exitCode=1});
