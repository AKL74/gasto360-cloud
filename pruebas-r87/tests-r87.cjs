'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=__dirname;
const core=require('./scanner-r86-core.js');
const engineSource=fs.readFileSync(path.join(root,'ocr-r87.js'),'utf8');
const data=[
 ['Mercadona','MERCADONA S.A.\nFECHA 30/09/2026\nTOTAL 10,48 €\nTARJETA',10.48,'MERCADONA, S.A.','Tarjeta'],
 ['Alcampo','ALCAMPO JEREZ\nFECHA 06/11/2026\nTOTAL 9,03',9.03,'ALCAMPO','Otro'],
 ['MERCAD0NA','MERCAD0NA S.A.\n22/10/2026\nTOTAL 9,75 €',9.75,'MERCADONA, S.A.','Otro'],
 ['Grupo DIA','GRUPO DIA\n29/09/2026\nTOTAL 5,40\nEFECTIVO',5.40,'GRUPO DÍA','Efectivo'],
 ['TGB','TGB The Good Burger\n24/09/2026\nTOTAL 13,80',13.80,'TGB The Good Burger','Otro'],
 ['Lidl','LIDL\n29/09/2026\nTOTAL 11,18\nTARJETA',11.18,'LIDL','Tarjeta'],
 ['100 montaditos','100 MONTADITOS\n24/09/2026\nTOTAL 6,70',6.70,'100 MONTADITOS','Otro'],
 ['Alcampo importe','ALCAMPO JEREZ\n24/09/2026\nTOTAL A PAGAR 40,00',40,'ALCAMPO','Otro'],
 ['Primor','PRIMOR\n06/11/2026\nTOTAL 2,99 €',2.99,'PRIMOR','Otro'],
 ['Asador Getnet','Getnet\nASADOR REAL\n01/10/2026\n17,60 €\nVENTA\nAUT 625442',17.60,'ASADOR REAL','Tarjeta']
];
for(const [name,text,amount,merchant,payment] of data){
 const x=core.extract(text,88,[]);
 assert.equal(x.amount,amount,name+' amount');assert.equal(x.merchant,merchant,name+' merchant');
 assert.equal(x.payment,payment,name+' payment');
}
assert.equal(core.extract('PRIMOR\nPRODUCTO 2,99',82,[]).amount,'','No inventar importe');
assert.equal(core.extract('ALCAMPO\nTOTAL 10,00',82,[]).date,'','No inventar fecha');
assert.equal(core.extract('MERCADONA\nT0TAL\n10,48 €\nTARJETA BANCARTA',85,[]).amount,10.48,'Total separado en línea');
assert.equal(core.extract('Getnet\nASADOR REAL\n01/10/2026\n17,60 €\nAUT 625442',85,[]).documentType,'justificante_tarjeta');
assert.equal(core.parseDate('31/02/2026'),'','Fecha inválida');

// Prueba simulada de Tesseract.js para verificar orquestación y combinación,
// sin afirmar una precisión OCR que depende de fotos reales y del navegador.
const texts=[
 'MERCADONA S.A.\nFECHA 30/09/2026',
 'DESCRIPCION\nARANDANOS 2,35',
 'MERCADONA S.A.\nFECHA 30/09/2026',
 'T0TAL\n10,48 €\nTARJETA BANCARTA',
 'T0TAL\n10,48 €\nTARJETA'
];
let n=0,terminated=false;
const fakeTesseract={
 OEM:{LSTM_ONLY:1},PSM:{SINGLE_BLOCK:'6',SPARSE_TEXT:'11'},
 createWorker:async()=>({
   setParameters:async()=>({}),
   recognize:async()=>({data:{text:texts[n++]||'',confidence:90}}),
   terminate:async()=>{terminated=true;}
 })
};
const fakeDoc={
 createElement:()=>({
  width:1,height:1,
  getContext:()=>({
   fillStyle:'#fff',fillRect:()=>{},drawImage:()=>{},
   getImageData:(x,y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(245)}),
   putImageData:()=>{}
  })
 })
};
const sandbox={window:{Tesseract:fakeTesseract},Tesseract:fakeTesseract,document:fakeDoc,console,
 Uint8ClampedArray,Uint32Array,Math,JSON,Date,String,Number,Set,Map};
vm.runInNewContext(engineSource,sandbox);
(async()=>{
 const output=await sandbox.window.Gasto360OCRR87.run({width:60,height:120},core.extract,[],()=>{});
 assert.equal(output.fields.merchant,'MERCADONA, S.A.');
 assert.equal(output.fields.date,'2026-09-30');
 assert.equal(output.fields.amount,10.48);
 assert.equal(output.fields.payment,'Tarjeta');
 assert.ok(output.diagnostics.passes.length>=4);
 assert.equal(terminated,true);
 console.log('R8.7 OK: 10 ejemplos, 4 controles y orquestación OCR multizona (simulada)');
})().catch(e=>{console.error(e);process.exitCode=1});
