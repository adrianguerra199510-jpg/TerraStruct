# TerraStruct

Aplicación para el **análisis y diseño de fundaciones y muros de retención**, con **memoria de cálculo en PDF y Word**.

## Qué hace

**Fundaciones**
- Zapatas aisladas o combinadas de **cualquier geometría** (rectangular, circular, L, T, trapezoidal, triangular, poligonal libre; los vértices se editan en tabla o arrastrando en el dibujo).
- Columnas de **cualquier forma** (rectangular, circular, poligonal regular, L, T, I/H, cruz o libre), con giro, posición y cargas D, L, W, E (P, Vx, Vy, Mx, My).
- Presión de contacto lineal **sin tracción** (contacto parcial por iteración), deslizamiento y volcamiento en servicio.
- Diseño ACI 318: flexión (barrido de secciones), cortante en una dirección, punzonamiento con momento desbalanceado (perímetro crítico numérico), aplastamiento, desarrollo y barras de espera.
- Ayudas: espesor mínimo automático y ampliación por presión.

**Muros de retención**
- Voladizo de concreto, **contrafuertes internos** y **externos**, gravedad de concreto, gravedad de **mampostería**, **mampostería reforzada**; todos admiten **llave de corte**.
- Empuje Rankine (plano virtual) o Coulomb, talud, sobrecarga, nivel freático/subpresión, pasivo frontal, **sismo (Mononobe–Okabe)**.
- Volcamiento, deslizamiento, presión de contacto, capacidad portante (Meyerhof/Vesic) y diseño estructural por elemento.

**Memoria de cálculo**: carátula, contenido, hipótesis, fórmulas con valores sustituidos, tablas, figuras y cuadro de armado. Por elemento o del proyecto completo. Unidades SI (kN, kPa, MPa) o técnicas (tonf, kgf/cm²).

## Uso

- **Sin instalar nada**: abra `release/TerraStruct.html` en Chrome o Edge (funciona sin conexión). Desde Chrome/Edge puede *Instalar* la app para tener el icono en el escritorio.
- **Desarrollo**: `npm install`, `npm run dev`; `npm run build` (carpeta `dist/`, PWA); `npm run build:single` (un solo HTML); `npm test`; `npm run icons` regenera los iconos.

Los datos se guardan automáticamente en el navegador y se pueden exportar/abrir como `.terrastruct.json`.

## Verificación del motor

`npm test` incluye comparaciones contra soluciones analíticas (presiones con excentricidad, momentos de zapata, Ka de Coulomb y Mononobe–Okabe contra el método de cuña de prueba, equilibrio de la presión de base en muros, etc.).

## Limitaciones

No incluye estabilidad global (taludes), asentamientos, zapatas sobre base elástica ni diseño sísmico de la estructura. Es una ayuda de cálculo: los resultados deben ser revisados y avalados por un ingeniero responsable.

## Aplicación de escritorio (Electron)

`npm run electron` abre la app en una ventana propia. `npm run dist:win` genera `release-electron/TerraStruct-1.0.0-win.zip` (descomprimir y ejecutar `TerraStruct.exe`; puede compilarse desde Windows o Linux).
