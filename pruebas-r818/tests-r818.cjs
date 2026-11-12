'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root={Gasto360DesgloseR816:{summary:(items,total)=>({total,status:items.every(x=>x.gross!==null)&&Math.abs(items.reduce((s,x)=>s+x.gross,0)-total)<.025?'cuadrado':'pendiente'})}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'revision-r818.js'),'utf8'),{window:root,module:{exports:{}}});
const a=root.Gasto360RevisionR818,pass=(label,text)=>({label,text});
const original=pass('original',`COMERCIO FICTICIO S.A.
A-12 349674
30/09/2026 13:05
FACTURA SIMPLIFICADA; 4321-005-123456
Descripcion P. Unit Imp.(€)
1 PRODUCTO AZUL 500 GR 6,50
1 PAPEL HOGAR DOBLE 2,30
1 FRUTA AMARILLA
1,084 kg 1,55 €/kg 1,68
TOTAL (€) 10,8
TARJETA BANCARIA 10,46
IVA BASE IMPONIBLE (€) CUOTA (€)
4% 7.87 031
21% 1,90 0,40
TOTAL 9,77 J 0,71
Importe: 10,48 €`);
const contraste=pass('contraste',`COMERCIO FICTICIO S.A.
A-12 347674
30/09/2026 13:05
FACTURA SINPLIFICADA: 4321-005-123456
Descripción P. Unit Imp.(e)
1 PRODUCTO AZUL 500 GR 6,50
1 PAPEL HOGAR DOBLE 2,30
1 FRUTA AMARILLA |
1,084 ky 1,55 €/kg 1,68
IDTAL (€) 10,48
TARJETA BANCARIA 10,48
IVA BASE IMPONIBLE (€) CUOTA (€)
4% 7.87 0,31
21% 1,90 0,40
TOTAL 9,77
Importe: 10,48 €`);
const p=[original,contraste],f=a.findFiscal(p,10.48,null);
assert.equal(f.base,9.77);assert.equal(f.tax,.71);assert.equal(f.gross,10.48);assert.equal(f.rows.length,2);
assert.equal(f.inferredRows,1);assert.equal(a.findFiscal(p,10.40,null),null);
assert.equal(a.findCif(p).id,'A12345674');assert.equal(a.findCif(p).confidence,'deducido');
assert.equal(a.findInvoice(p).id,'4321-005-123456');
const items=a.reconcileProducts(p,10.48);
assert.equal(items.length,3);assert.equal(items[0].unit,'ud');assert.equal(items[2].unit,'kg');
assert.equal(items[2].gross,1.68);assert.equal(items[2].weightKg,1.084);
assert.equal(items[2].needsReview,false);
assert.equal(a.reconcileProducts(p,9.77),null);
const fields={amount:10.48,invoiceNo:'SINPLIFICADA',taxId:'',tax:null,base:null,confidence:{},flags:[]};
const analysis={items:[{name:'IDTAL',gross:null}],essential:{}};
a.apply(fields,analysis,p);
assert.equal(fields.tax,.71);assert.equal(fields.base,9.77);
assert.equal(fields.invoiceNo,'4321-005-123456');assert.equal(fields.taxId,'A12345674');
assert.equal(fields.items.length,3);assert.equal(analysis.reconciliation.status,'cuadrado');
const simple=pass('original',`COMERCIO FICTICIO
Descripcion P. Unit Imp.(€)
1 PRODUCTO BLANCO 1,65
TOTAL 1,65
ENTREGA EFECTIVO 2,00
DEVOLUCION 0,35
IVA BASE IMPONIBLE (€) CUOTA (€)
21% 1,36 0,29
TOTAL 1,36 0,29`);
assert.equal(a.findFiscal([simple],1.65,null).tax,.29);
assert.equal(a.reconcileProducts([simple],1.65).length,1);
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const scanner=fs.readFileSync(path.join(__dirname,'scanner.js'),'utf8');
assert.ok(html.includes('revision-r818.js?v=8.18'));
assert.ok(scanner.includes('Gasto360RevisionR818.apply'));
console.log('R8.18 OK: IVA mixto y simple, base, factura, CIF, unidad y exclusión falso TOTAL.');
