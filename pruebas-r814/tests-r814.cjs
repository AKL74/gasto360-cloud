'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=__dirname,api=require('./desglose-r814.js'),core=require('./scanner-r86-core.js');
const scanner=fs.readFileSync(path.join(dir,'scanner.js'),'utf8'),
html=fs.readFileSync(path.join(dir,'index.html'),'utf8'),
ocr=fs.readFileSync(path.join(dir,'ocr-r87.js'),'utf8'),
app=fs.readFileSync(path.join(dir,'test-app.js'),'utf8');
assert.match(scanner,/Gasto360OCRR814\.run\(dst/);
assert.match(ocr,/window\.Gasto360OCRR814\s*=/);
assert.match(html,/<script src="\.\/desglose-r814\.js\?v=8\.14"><\/script>[\s\S]*<script src="\.\/scanner\.js\?v=8\.14"><\/script>/);
for(const id of ['purchaseReconciliation','taxBreakdownRows','taxBreakdownState','itemsReviewNote','addItemBtn','itemsList'])
 assert.ok(html.includes('id="'+id+'"'),'Falta UI '+id);
assert.match(scanner,/Gasto360DesgloseR814\.analyze/);
assert.match(scanner,/renderVatDetails\(\)/);
assert.match(scanner,/normalizeEditable\(candidate\)/);
assert.match(scanner,/Cifras modificadas: revisar/);
assert.match(scanner,/liveValid/);
assert.match(scanner,/scannerVersion:"R8.14"/);
assert.ok(app.includes('R8.14 TEST'));
assert.ok(html.includes('id="compareSessionPrices"'));
assert.ok(html.includes('id="sessionPriceComparison"'));
assert.ok(html.includes('id="docItemsSummary"'));
assert.match(app,/function comparePricesInSession\(\)/);
assert.match(app,/const products=f\.items\|\|selected\.metadata\.items\|\|\[\]/);
assert.match(app,/selected\.fields/);
assert.ok(!/supabase\.from\(/i.test(app),'el entorno de pruebas no escribe en Supabase');

const original=[
'LIDL SUPERMERCADOS S.A.U.','Avda Reina Sofia S/N','11407 Jerez de la Frontera','NIF A60195278','EUR',
'MIEL DE FLORES 3,09 B','PROMO LIDL PLUS 3,09',
'MOZZARELLA RALLADA 1,95 A','PROMO LIDL PLUS 1,95',
'COLAGENO C/ MAGNESIO 4,99x 7 9,98 B','PROMO LIDL PLUS 1,50',
'MINI TAQUITOS JAMÓN 2,59 B','PROMO LIDL PLUS 0,39',
'BAGUETTE 0,45 A','VINO TINTO DO RIBERA 5,59x 3 1 16,77 €',
'CHAMPÚ REPARAC.,PLEX AT','OSCAR MAYER BACON 2,35 B',
'PECHUGA ENTERA JUGOS 5,40 B','0,800 kg x 6,75 EUR/kg',
'REGA 10% ACEITE OLIV 0,69x 3 2,07 A','UVA BLANCA GRANEL ZONA',
'0,838 kg x 2,99 EUR/kg',
'Total 42,48','ENTREGA 42,48','VENTA CONTADO','04/11/2026','IMP.: 42,48 EUR','RECIBO PARA EL CLIENTE',
'IVA% IVA + PN = PVP','A 4h 0,19 4,84 5,03','B 10% 1,68 16,75 18,43',
'C 21% 3,30 15, e 19,02','Suma 5,17 37,31 42,48',
'Desc. total en compra','6,93 EUR','Total oferta Lidl Plus:','6,93 EUR','www.lidl.es'
].join('\n');
const contrast=original.replace('UVA BLANCA GRANEL ZONA','UVA BLANCA GRANEL 2,51 A')
 .replace('VINO TINTO DO RIBERA 5,59x 3 1 16,77 €','VINO TINTO DO RIBERA 5,59x 3 1.')
 .replace('CHAMPÚ REPARAC.,PLEX AT','CHAMPÚ REPARAC.,PLEX 450');
const passes=[{label:'original',text:original,confidence:83},{label:'contraste',text:contrast,confidence:86},
 {label:'cabecera',text:'LIDL\nMIEL DE FLORES\n3,09 B',confidence:76},
 {label:'pie',text:'VENTA CONTADO\nIMP 42,48 EUR\n6,93 EUR',confidence:70}];
const receipt=api.analyze(passes,{amount:42.48,merchant:'LIDL'});
assert.equal(receipt.version,'R8.14');
assert.equal(receipt.items.length,11,'Once referencias de producto');
assert.equal(receipt.reconciliation.known,10);
assert.equal(receipt.reconciliation.unknown,1);
assert.equal(receipt.reconciliation.discounts,6.93);
assert.equal(receipt.reconciliation.grossKnown,47.16);
assert.equal(receipt.reconciliation.netKnown,40.23);
assert.equal(receipt.reconciliation.difference,2.25);
assert.equal(receipt.reconciliation.status,'pendiente','No declarar cuadrado por diferencia asumida');
assert.equal(receipt.fiscal.status,'validado');
assert.equal(receipt.fiscal.base,37.31);
assert.equal(receipt.fiscal.tax,5.17);
assert.equal(receipt.fiscal.gross,42.48);
assert.equal(receipt.fiscal.inferredRows,1,'La base 21% se deriva de PVP - IVA');
assert.equal(receipt.fiscal.rows.length,3);
assert.ok(receipt.items.every(x=>!/(?:LIDL PLUS|IVA%|VENTA CONTADO)/.test(x.name)));
const find=n=>receipt.items.find(x=>api.canonical(x.name).includes(api.canonical(n)));
assert.equal(find('MIEL DE FLORES').gross,3.09);
assert.equal(find('MIEL DE FLORES').discount,3.09);
assert.equal(find('MOZZARELLA RALLADA').discount,1.95);
assert.equal(find('COLAGENO').gross,9.98);
assert.equal(find('COLAGENO').quantity,2);
assert.equal(find('COLAGENO').quantityInferred,true);
assert.equal(find('MINI TAQUITOS').discount,0.39);
assert.equal(find('VINO TINTO').quantity,3);
assert.equal(find('VINO TINTO').gross,16.77);
assert.equal(find('PECHUGA').weightKg,.8);
assert.equal(find('PECHUGA').unitPrice,6.75);
assert.equal(find('REGA').quantity,3);
assert.equal(find('UVA BLANCA').gross,2.51,'Completar el precio desde el otro pase OCR');
assert.equal(find('UVA BLANCA').weightKg,.838);
const shampoo=find('CHAMPÚ');
assert.ok(shampoo&&shampoo.gross===null);
assert.equal(receipt.reconciliation.suggestion.itemId,shampoo.id);
assert.equal(receipt.reconciliation.suggestion.amount,2.25,'Solo sugerencia, NO valor asignado');
assert.ok(shampoo.reviewReasons.length);
const confirmed=api.normalizeEditable({...shampoo,gross:2.25,manualReview:true});
assert.equal(confirmed.gross,2.25);
const edited=receipt.items.map(x=>x.id===shampoo.id?confirmed:x);
assert.equal(api.summary(edited,42.48).status,'cuadrado','Si se confirma manualmente el precio, cuadra');
assert.equal(api.summary(receipt.items,42.48).status,'pendiente','La confirmación NO muta el OCR original');
assert.throws(()=>api.normalizeEditable({...shampoo,gross:-2}),/inválido/);
assert.throws(()=>api.normalizeEditable({...shampoo,gross:1,discount:2}),/inválido/);
assert.equal(api.fiscalFromPasses([{label:'ocr',text:'IVA% IVA + PN = PVP\nA 4% 0,19 4,84 5,03'}],42.48).status,'pendiente');
assert.equal(api.analyze([{label:'original',text:'VENTA CONTADO\nRECIBO PARA EL CLIENTE\nTOTAL 10,00',confidence:90}],{amount:10}).items.length,0);
assert.equal(core.extract(original,86,[]).amount,42.48,'No alterar total original R8.13');
assert.equal(core.extract(original,86,[]).merchant,'LIDL','No alterar comercio R8.13');
console.log('R8.14 PASS: 11 artículos, 4 descuentos, factura fiscal, cantidades, peso, precio dudoso, editor, integración.');
