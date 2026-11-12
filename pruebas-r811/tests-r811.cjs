'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dir=__dirname,parser=require('./scanner-r86-core.js');
const scanner=fs.readFileSync(path.join(dir,'scanner.js'),'utf8'),
 engineSource=fs.readFileSync(path.join(dir,'ocr-r87.js'),'utf8'),
 html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
assert.match(scanner,/Gasto360OCRR811\.run\(dst/);
assert.match(engineSource,/window\.Gasto360OCRR811\s*=/);
assert.match(html,/<script src="\.\/ocr-r87\.js\?v=8\.11"><\/script>[\s\S]*<script src="\.\/scanner\.js\?v=8\.11"><\/script>/);
assert.match(scanner,/cv\.INTER_CUBIC/,'restaurada interpolación de imagen de R8.7');
assert.match(scanner,/a=cv\.imread\(src\)/,'restaurada corrección de perspectiva que funcionó');
assert.match(engineSource,/Math\.min\(3\.2,4000\/Math\.max\(w,h\)/,'restaurar resolución OCR de R8.7');
assert.match(scanner,/El recuadro rodea casi toda la fotografía/,'evitar analizar el fondo');
assert.ok(!scanner.includes('Gasto360OCRR89'), 'ninguna referencia al OCR deteriorado');
const p=(text)=>parser.extract(text,81,[]);
const originals=[
 ['LIDL SUPERMERCADOS S.A.U\n04/11/2026\nVENTA CONTADO\nIMP. : 42,48 EUR\nRECIBO PARA EL CLIENTE\nTotal oferta Lidl Plus:\n6,93 EUR','LIDL',42.48,'Tarjeta'],
 ['MERCADONA S.A.\n30/09/2026\nTOTAL 10,48 EUR\nTARJETA','MERCADONA, S.A.',10.48,'Tarjeta'],
 ['ALCAMPO JEREZ\n06/11/2026\nTOTAL 9,03','ALCAMPO',9.03,'Otro'],
 ['GRUPO DIA\n29/09/2026\nTOTAL 5,40\nEFECTIVO','GRUPO DÍA',5.4,'Efectivo'],
 ['VENTA CONTADO\nRECIBO PARA EL CLIENTE\nIMP. : 42,48 EUR','',42.48,'Tarjeta'],
 ['VENTA CONTADO\nDESCUENTO LIDL PLUS 6,93','', '', 'Otro'],
 ['100 MONTADITOS\n24/09/2026\nTOTAL 6,70','100 MONTADITOS',6.70,'Otro']
];
for(const [raw,merchant,amount,payment] of originals){
 const x=p(raw);
 assert.equal(x.merchant,merchant,'establecimiento');
 assert.equal(x.amount,amount,'importe total real');
 assert.equal(x.payment,payment,'forma de pago');
}
const sampleTax=p('LIDL\nIVA + PN = PP\n4% 0,19 4,84 5,03\n10% 1,68 16,75 18,43\n21% 3,30 15,72 19,02\nSuma 5,17 37,31 42,48\nIMP. : 42,48 EUR');
assert.equal(sampleTax.tax,5.17);
assert.equal(sampleTax.base,37.31);
assert.equal(sampleTax.amount,42.48);
assert.ok(!p('LIDL\nSuma 17 37,31').tax,'no tomar OCR de IVA corrupto como dato fiable');
let call=0,closed=false;
const fake=[
 'LIDL SUPERMERCADOS S.A.U\n04/11/2026\nMIEL DE FLORES 2,99\nVENTA CONTADO\nIMP. : 42,48 EUR\nRECIBO PARA EL CLIENTE\nTotal oferta Lidl Plus: 6,93 EUR',
 'LIDL SUPERMERCADOS S.A.U\n04/11/2026\nIMP. : 42,48 EUR\nRECIBO PARA EL CLIENTE\nVENTA CONTADO',
 'LIDL SUPERMERCADOS S.A.U\n04/11/2026',
 'VENTA CONTADO\nIMP. : 42,48 EUR\nRECIBO PARA EL CLIENTE',
 'TOTAL OFERTA LIDL PLUS\n6,93 EUR'
];
const Tesseract={OEM:{LSTM_ONLY:1},PSM:{SINGLE_BLOCK:'6',SPARSE_TEXT:'11'},
 createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:fake[call++]||'',confidence:78}}),terminate:async()=>{closed=true}})};
const document={createElement:()=>({
 width:1,height:1,
 getContext:()=>({fillRect(){},drawImage(){},putImageData(){},
 getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(230)})})
})};
const window={Tesseract};
const ctx={window,document,Tesseract,Math,Number,String,Date,Set,Map,JSON,Uint8ClampedArray,Uint32Array,console};
vm.runInNewContext(engineSource,ctx);
(async()=>{
 const r=await ctx.window.Gasto360OCRR811.run({width:443,height:1449},parser.extract,[],()=>{});
 assert.equal(r.fields.merchant,'LIDL');
 assert.equal(r.fields.date,'2026-11-04');
 assert.equal(r.fields.amount,42.48);
 assert.equal(r.fields.payment,'Tarjeta');
 assert.ok(!r.fields.amountCandidates.some(x=>x===6.93&&r.fields.amount===6.93),'no confundir oferta con total');
 assert.ok(closed,'liberar motor OCR');
 assert.ok(r.diagnostics.passes.length>=3);
 console.log('R8.11 OK: OCR R8.7 restaurado, 7 casos, fiscales y combinación de lecturas');
})().catch(e=>{console.error(e);process.exitCode=1});
