# Gasto360 R8.6 — Propuesta de mejora del escáner

Esta rama NO está publicada en GitHub Pages y no altera la aplicación actual.

## Cambios
- Conserva el gasto y los documentos originales y corregidos: sin migraciones ni borrado de históricos.
- Aumenta la resolución de trabajo y amplía recibos estrechos para OCR.
- Detecta contornos pequeños (antes se descartaban por ocupar menos del 8 %), priorizando el papel blanco frente a las carpetas de fondo.
- Realiza la detección sobre una copia reducida de la imagen, pero conserva la mayor resolución del recorte para leer los textos.
- Analiza comercios frecuentes, fechas, totales y diferencia tickets de justificantes de tarjeta.
- No rellena la fecha de hoy si no se reconoce; exige comercio, fecha e importe antes de guardar.
- Corrige la selección visual de Original/Corregido en el archivo de documentos.
- No incorpora servidores OCR externos: usa OpenCV y Tesseract en el navegador.

## Pruebas automáticas
Comando: node tests/scanner-r86.test.cjs

Incluye diez transcripciones representativas y controles de ausencia de total, fecha inválida, justificante bancario y varios comercios.
Estas pruebas son sobre TEXTOS DE MUESTRA y NO demuestran que las imágenes originales se reconozcan correctamente.

## Validación obligatoria con teléfono real
1. Realizar foto a un solo ticket sobre una carpeta roja y confirmar las cuatro esquinas.
2. Realizar foto con varios tickets: confirmar que no se asigna el importe de otro documento.
3. Comprobar el resultado corregido en Documentos y leer el texto OCR.
4. Verificar manualmente los diez ejemplos de Mercadona, Alcampo, Lidl, Día, TGB, 100 Montaditos, Primor y Asador Real.
5. Probar cámara y galería de Samsung Internet, y un caso de conexión interrumpida.
6. Revisar histórico Supabase y arranque del HUB Windows, que NO se modifica en esta rama.

Limitaciones: fotos borrosas o con letras minúsculas pueden seguir fallando; el desglose de IVA y productos puede exigir corrección humana; un justificante de tarjeta no sustituye una factura. La aplicación sigue requiriendo confirmación humana.
