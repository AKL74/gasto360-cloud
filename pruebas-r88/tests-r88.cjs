'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const core=require('./scanner-r86-core.js');
const root=__dirname;
const r88=[
'LIDL SUPERMERCADOS S.A.U','FECHA 04/11/2026','MIEL DE FLORES 3,09 E',
'PROMO LIDL PLUS 0,50','BAGUETTI 0,45 A','UVA BLANCA GRANEL 2,51 B',
'0,030 kg x 2,99 EUR/kg','lotal 47,%','ENTREGA 51,52',
'VENTA CONTADO','111122XXXXXX3333','04/11/2026','IMP. : 42,48 EUR',
'RECIBO PARA EL CLIENTE','IVAX IVA + PN = PP','A 4% 0,19 4,84 5,03',
'B 10% 1,68 16,75 18,43','C 21% 3,30 15,72 19,02','Suma 5,17 37,31 2.4',
'Desc. total en compra','6,93EUR','Total oferta Lidl Plus:','6,93 EUR'
].join('\n');
const r=core.extract(r88,88,[]);
assert.equal(r.merchant,'LIDL');
assert.equal(r.date,'2026-11-04');
assert.equal(r.amount,42.48,'IMP. 42,48 prevalece sobre ahorros 6,93');
assert.equal(r.tax,5.17);
assert.equal(r.base,37.31);
assert.equal(r.fiscalValidated,true);
assert.equal(r.payment,'Tarjeta','VENTA CONTADO mas evidencia de terminal');
assert.equal(r.totalSource,'importe abonado');
assert.ok(!r.amountCandidates.includes(6.93),'No ofrecer descuentos como total');
assert.ok(!r.items.some(x=>/kg\s*x/i.test(x.name)),'Peso y precio/kg no son nombre de producto');
assert.ok(!r.items.some(x=>/PROMO|PLUS/i.test(x.name)),'Promociones no son producto');
assert.ok(!r.merchantCandidates.some(x=>/VENTA CONTADO|IMP\./i.test(x.name)),'Descartar falsas empresas');
assert.equal(core.extract('VENTA CONTADO\nTOTAL 20,00',89,[]).payment,'Otro');
assert.equal(core.extract('TOTAL 20,00\nEFECTIVO',89,[]).payment,'Efectivo');
assert.equal(core.extract('TOTAL 20,00\nTARJETA',89,[]).payment,'Tarjeta');
assert.equal(core.extract('TOTAL 20,00\nTARJETA\nEFECTIVO',89,[]).payment,'Otro');
assert.equal(core.extract('TOTAL OFERTA LIDL PLUS\n6,93 EUR',89,[]).amount,'','No confundir ahorro con gasto');
assert.equal(core.extract('IMP. : 42,48 EUR',89,[]).amount,42.48);
assert.equal(core.extract('TOTAL COMPRA\n42,48 EUR',89,[]).amount,42.48);
assert.equal(core.extract('IVAX IVA PN PP\nA 4% 0,19 4,84 5,03\nB 10% 1,68 16,75 18,43\nC 21% 3,30 15,72 19,02\nSuma 5,17 37,31',89,[]).amount,42.48,'Cuadre fiscal documentado');
assert.equal(core.extract('TOTAL 10,00\nPROMO 2,00',88,[]).amount,10);
assert.equal(core.extract('PROMO LIDL PLUS 6,93\nENTREGA 42,48',89,[]).amount,'','Sin etiqueta de total ni cuadro fiscal no se inventa');
const receipts=[
 ['MERCADONA S.A.\n30/09/2026\nTOTAL 10,48\nTARJETA','MERCADONA, S.A.',10.48],
 ['ALCAMPO JEREZ\n06/11/2026\nTOTAL 9,03','ALCAMPO',9.03],
 ['GRUPO DIA\n29/09/2026\nTOTAL 5,40','GRUPO DÍA',5.40],
 ['TGB The Good Burger\n24/09/2026\nTOTAL 13,80','TGB The Good Burger',13.80],
 ['LIDL\n29/09/2026\nTOTAL 11,18','LIDL',11.18],
 ['100 MONTADITOS\n24/09/2026\nTOTAL 6,70','100 MONTADITOS',6.70],
 ['PRIMOR\n06/11/2026\nTOTAL 2,99','PRIMOR',2.99],
 ['Getnet\nASADOR REAL\n01/10/2026\n17,60 €\nAUTORIZACION 123456','ASADOR REAL',17.60],
 ['MERCADONA S.A.\n22/10/2026\nTOTAL 9,75','MERCADONA, S.A.',9.75],
 ['ALCAMPO JEREZ\n24/09/2026\nTOTAL 40,00','ALCAMPO',40]
];
for(const [raw,name,amount] of receipts){const x=core.extract(raw,87,[]);assert.equal(x.merchant,name);assert.equal(x.amount,amount)}
const src=fs.readFileSync(path.join(root,'ocr-r87.js'),'utf8');
const sandbox={window:{},Tesseract:{},console,Math,Date,Set,Map,JSON,Number,String,Uint8ClampedArray,Uint32Array};
vm.runInNewContext(src,sandbox);
const a=core.extract('LIDL\n04/11/2026\nTOTAL 6,93\nEFECTIVO',57,[]);
const b=core.extract('LIDL\n04/11/2026\nIMP. : 42,48 EUR\nTARJETA',90,[]);
const c=core.extract(r88,88,[]);
const joined=sandbox.window.Gasto360OCRR87.combine([
 {label:'original',confidence:57,fields:a,text:'TOTAL 6,93'},
 {label:'pie',confidence:90,fields:b,text:'IMP. : 42,48'},
 {label:'contraste',confidence:88,fields:c,text:r88}
]);
assert.equal(joined.fields.amount,42.48);
assert.equal(joined.fields.payment,'Tarjeta');
assert.equal(joined.fields.tax,5.17);
assert.equal(joined.fields.base,37.31);
console.log('Gasto360 R8.8: 10 ejemplos + ticket anonimizado, IVA, pago, descuentos, artículos y fusión OCR: OK');
