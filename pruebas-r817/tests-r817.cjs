'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=n=>fs.readFileSync(path.join(__dirname,n),'utf8');
const w={};
vm.runInNewContext(read('esenciales-r817.js'),{window:w,module:{exports:{}}});
const api=w.Gasto360EsencialesR817;
const pass=(label,text)=>({label,text,confidence:80});
// Todos los comerciantes, identificadores y artículos siguientes son de ejemplo sintético.
const small=[
 pass('original',\`TIENDA DE ENSAYO, S.A.
A-12345678
01/10/2026 09:38 OP:1111
Descripción P. Unit Imp.(€)
PRODUCTO DE ENSAYO 1,65
TOTAL 0 LE
ENTREGA EFECTIVO 7,00
DEVOLUCIÓN 0,3)
IVA BASE IMPONIBLE (€) CUOTA (€)
21% 1. 0,29
TOTAL 1,36 0,29\`),
 pass('contraste',\`TIENDA DE ENSAYO, S.A.
A-12345678
01/10/2026 09:38 OP:1111
Descripción P. Unit Imp.(€)
PRODUCTO DE ENSAYO 1,65
TOTAL W Le
ENTREGA EFECTÍO 2,00
DEVOLUCIÓN 0,3
IVA BASE IMPONIBLE (€) CUOTA (€)
21% 1,36 1,29
TOTAL 1,36 0,29\`)];
let f={amount:.29,merchant:'TIENDA DE ENSAYO, S.A.',confidence:{merchant:92,amount:85},flags:[]};
let x=api.interpret(small,f);
assert.equal(x.amount,1.65);assert.equal(x.fiscal.base,1.36);assert.equal(x.fiscal.tax,.29);
assert.equal(x.fiscal.status,'validado');assert.equal(x.payment,'Efectivo');assert.equal(x.date,'2026-10-01');
const w2={Gasto360DesgloseR816:{summary:(items,total)=>({total,netKnown:0,status:'pendiente'})}};
vm.runInNewContext(read('esenciales-r817.js'),{window:w2,module:{exports:{}}});
let analysis={items:[{name:'PRODUCTO DE ENSAYO',gross:null,unit:'kg',weightKg:null,needsReview:true}]};
w2.Gasto360EsencialesR817.apply(f,analysis,x);
assert.equal(f.amount,1.65);assert.equal(f.tax,.29);assert.equal(f.base,1.36);
assert.equal(f.payment,'Efectivo');assert.equal(f.fiscalValidated,true);assert.equal(analysis.items[0].unit,'ud');
const large=[
 pass('original',\`TIENDA DE ENSAYO, S.A.
26/09/2026 20:42 OP:1111
Descripción P. Unit Imp.(€)
ARTICULO PRUEBA 1,00
TOTAL Hi 47,08
TARJETA BANCART 42,06
IVA BASE IMPONIBLE (€) CUOTA (€)
4% 36,86 1,47
10% 3,41 0,34
TOTAL 40,27 1,81
Importe: 42,08 € CONTADO\`),
 pass('contraste',\`TIENDA DE ENSAYO, S.A.
26/09/2026 20:42 OP:1111
Descripción P. Unit Imp.(€)
ARTICULO PRUEBA 1,00
TOTAL 4,08
TARJETA BANCARIA 42,08
IVA BASE IMPONIBLE (€) CUOTA (€)
4% 36,86 1,47
10% 3,41 0,34
TOTAL 40,27 1,81
Importe: 42,08 € CONTADO\`)];
x=api.interpret(large,{amount:47.08});
assert.equal(x.amount,42.08);assert.equal(x.fiscal.tax,1.81);assert.equal(x.fiscal.base,40.27);
assert.equal(x.payment,'Tarjeta');assert.equal(x.date,'2026-09-26');
assert.equal(x.fiscal.rows.length,2);
const noReceipt=api.interpret([{label:'original',text:'ENTREGA EFECTIVO 2,00\nCUOTA 0,29',confidence:86}],{amount:.29});
assert.equal(noReceipt.amount,null,'No interpretar IVA suelto como TOTAL');
assert.equal(noReceipt.fiscal.status,'pendiente');
const html=read('index.html'),scanner=read('scanner.js');
assert.ok(html.includes('esenciales-r817.js?v=8.17'));
assert.ok(html.indexOf('esenciales-r817.js')<html.indexOf('scanner.js'));
assert.ok(scanner.includes('Gasto360EsencialesR817.interpret'));
assert.ok(scanner.includes('Gasto360EsencialesR817.apply'));
assert.ok(html.includes('id="essentialSummary"'));
console.log('PASS R8.17: cinco campos prioritarios, IVA 21%, IVA mixto, pagos y seguridad ante falsos TOTALES');
