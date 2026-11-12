'use strict';
const assert=require('node:assert/strict');
const s=require('../scanner-r86-core.js');
const examples=[
 ['MERCADONA','MERCADONA S.A.\nFECHA: 30/09/2026\nDESCRIPCION\n1 ARANDANOS 2,35\nTOTAL € 10,48\nTARJETA BANCARIA',10.48,'MERCADONA, S.A.','2026-09-30'],
 ['ALCAMPO','ALCAMPO JEREZ\nFECHA 06/11/2026\nDESCRIPCION\nLECHE 2,15\nTOTAL COMPRA 9,03',9.03,'ALCAMPO','2026-11-06'],
 ['MERCADONA 2','MERCADONA\n22/10/2026\nTOTAL 9,75',9.75,'MERCADONA, S.A.','2026-10-22'],
 ['DIA','GRUPO DIA\n29/09/2026\nMINI JAMON 2,35\nHUEVOS L 3,05\nTOTAL COMPRA 5,40',5.4,'GRUPO DÍA','2026-09-29'],
 ['TGB','TGB The Good Burger\n24/09/2026\nDESCRIPCION\nHAMBURGUESA 12,90\nTOTAL 13,80',13.8,'TGB The Good Burger','2026-09-24'],
 ['LIDL','LIDL\n29/09/2026\nVINO TINTO RIBERA 11,18\nTOTAL 11,18',11.18,'LIDL','2026-09-29'],
 ['100 MONTADITOS','100 MONTADITOS\n24/09/2026\nPRODUCTO\nPATATAS 2,60\nTOTAL 6,70',6.7,'100 MONTADITOS','2026-09-24'],
 ['ALCAMPO 2','ALCAMPO JEREZ\n24/09/2026\nARTICULO\nCARPETA 39,00\nTOTAL A PAGAR 40,00',40,'ALCAMPO','2026-09-24'],
 ['PRIMOR','PRIMOR\n06/11/2026\nCHAMPU 2,99\nTOTAL 2,99',2.99,'PRIMOR','2026-11-06'],
 ['ASADOR','Getnet\nASADOR REAL\n01/10/2026 14:13\n17,60 €\nVENTA\nAUTORIZACION 625442',17.6,'ASADOR REAL','2026-10-01']
];
for(const [name,raw,total,merchant,date] of examples){
 const x=s.extract(raw,89,[]);
 assert.equal(x.amount,total,name+' total');assert.equal(x.merchant,merchant,name+' comercio');assert.equal(x.date,date,name+' fecha');
}
assert.equal(s.extract(examples[9][1],89,[]).documentType,'justificante_tarjeta');
assert.equal(s.extract('PRIMOR\n06/11/2026\nCHAMPU 2,99',75,[]).amount,'');
assert.equal(s.parseDate('FECHA 31/02/2026'),'');
assert.equal(s.moneyVals('TOTAL 1.234,56 €')[0],1234.56);
const q=[{x:30,y:2},{x:70,y:2},{x:70,y:95},{x:30,y:95}];
function sample(rgb){const data=new Uint8ClampedArray(100*100*4);for(let i=0;i<data.length;i+=4){data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255}return {width:100,height:100,data}}
assert.ok(s.scoreQuad(q,100,100,sample([232,230,226]))>s.scoreQuad(q,100,100,sample([145,50,68])));
assert.ok(s.extract('MERCADONA\nALCAMPO\nFECHA 30/09/2026\nTOTAL 10,48',89,[]).flags.some(x=>/varios comercios/.test(x)));
console.log('OK: 10 casos de importes, comercio, fecha y 6 controles');
