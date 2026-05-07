# AR Internal World — Portal de Marcador de Imagen

Una experiencia WebAR en la que apuntar la cámara del móvil a un marcador impreso revela un mundo 3D en miniatura completo: una cámara hueca con colores en cada cara y una cabeza humana en su centro.

**Stack**: A-Frame 1.5.0 + MindAR 1.2.x + HTML/CSS/JavaScript vanilla
**Plataforma**: Web móvil — iOS Safari 15+ · Android Chrome (versión actual)
**Sin instalación. Sin app store. Sin paso de compilación.**

Ver `docs/app_reference.png` para el objetivo visual de referencia.

---

## Requisitos previos

- Un teléfono móvil (iOS o Android)
- Una copia impresa de la imagen del marcador (la misma imagen utilizada para compilar `assets/targets/marker.mind`)
- Un ordenador portátil en la misma red Wi-Fi que el teléfono

---

## Compilar el archivo de marcador (una sola vez)

Si `assets/targets/marker.mind` no está presente todavía:

1. Abre el compilador de marcadores oficial de MindAR (busca "MindAR image target compiler" o visita el sitio de documentación de `mind-ar-js`).
2. Sube la imagen fuente que vas a imprimir.
3. Verifica que la puntuación de calidad de rastreo sea **≥ 4 / 5** (las imágenes de colores planos rastrean mal; usa una imagen con muchos detalles).
4. Descarga el archivo `.mind` resultante y guárdalo como `assets/targets/marker.mind`.
5. Imprime la **misma** imagen fuente. El marcador compilado y el impreso deben coincidir exactamente.

---

## Entregar el modelo de cabeza

Coloca un archivo GLB optimizado para web en `assets/models/human_head.glb`.

**Requisitos (ver especificación completa en `specs/001-ar-internal-world/contracts/assets-contract.md`):**
- Formato: GLB (glTF 2.0 binario)
- Eje Y arriba, cabeza mirando hacia −Z en el sistema de coordenadas local
- Origen cerca del centro geométrico del cráneo
- ≤ 25K triángulos · ≤ 2 MB de texturas descomprimidas · ≤ 5 MB de tamaño de archivo

---

## Ejecutar en local — Opción A: mkcert + http-server

```bash
# Una sola vez: instalar la autoridad certificadora local
mkcert -install

# Desde la raíz del proyecto — reemplaza con la IP local de tu ordenador
mkcert <tu-ip-local>

# Servir por HTTPS en el puerto 8080
npx http-server -S -C cert.pem -K key.pem -p 8080
```

En el teléfono: abre `https://<tu-ip-local>:8080` en Safari o Chrome.

> Si iOS muestra una advertencia de certificado, importa la autoridad raíz de mkcert en el teléfono o usa la Opción B.

---

## Ejecutar en local — Opción B: túnel ngrok

```bash
# Terminal 1 — servidor HTTP simple
npx http-server -p 8080

# Terminal 2 — túnel HTTPS
ngrok http 8080
```

Abre en el teléfono la URL `https://*.ngrok-free.app` que muestra ngrok.

---

## Desplegar en Netlify — Opción C (recomendado para compartir)

Netlify sirve el sitio por HTTPS de forma gratuita, lo que lo hace ideal para probar en dispositivos reales o compartir la experiencia.

1. Asegúrate de que los assets están en su lugar:
   - `assets/targets/marker.mind`
   - `assets/models/human_head.glb`
2. Ve a [netlify.com](https://netlify.com) e inicia sesión (o crea una cuenta gratuita).
3. En el panel principal, arrastra **toda la carpeta del proyecto** a la zona de _"Drag and drop your site folder here"_.
4. Netlify genera automáticamente una URL `https://<nombre-aleatorio>.netlify.app`.
5. Abre esa URL en el teléfono — el acceso a la cámara funciona sin ninguna configuración adicional.

---

## Comportamiento esperado en el primer uso

1. La página carga → aparece la pantalla de carga.
2. Aparece el permiso de cámara → conceder.
3. Aparece el aviso "Apunta la cámara al marcador".
4. Apunta al marcador impreso → en ~2 s la cámara coloreada y la cabeza central aparecen con fundido **dentro** del marcador.
5. Mueve el dispositivo o inclina el marcador → paralaje realista (las paredes se desplazan, la cabeza ocluye la pared trasera).
6. El marcador sale del encuadre → el mundo desaparece con fundido limpio.
7. El marcador vuelve al encuadre → el mundo reaparece con fundido.

---

## Valores ajustables

Todos los parámetros están al inicio de `js/app.js` y en `DEFAULTS` de `js/components/chamber.js`:

| Parámetro | Valor por defecto | Efecto |
|---|---|---|
| `CHAMBER_SIZE.depth` | 1.0 | Aumentar para un paralaje más pronunciado |
| `HEAD_SCALE` | 0.4 | Tamaño de la cabeza relativo a la cámara |
| `FADE_DURATION_MS` | 350 | Duración de la animación de aparición/desaparición |
| `GRACE_WINDOW_MS` | 120 | Ventana de tolerancia ante parpadeos de rastreo |
| `JITTER_ALPHA` | 0.3 | Suavizado (menor = más suave, más retardo) |

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El permiso de cámara nunca aparece | No se usa HTTPS | Confirma que la URL comienza por `https://` |
| El mundo nunca aparece | Baja calidad de rastreo o marcador compilado diferente al impreso | Recompila el marcador; imprime a mayor resolución |
| El mundo tiembla con el marcador estático | `JITTER_ALPHA` demasiado alto | Reducir a 0.2 en `js/app.js` |
| El mundo flota fuera del marcador | Entidad hija incorrecta | Revisa la jerarquía de entidades en `index.html` |
| Las paredes aparecen al revés | `material.side` no es `back` | Verifica el material de las superficies en `chamber.js` |
| La cabeza no aparece | Error al cargar el GLB | Revisa la consola del navegador para `model-error` |
| Parpadeo en oclusión parcial | Ventana de gracia muy corta | Aumentar `GRACE_WINDOW_MS` a ~180 ms |
| Caída de fotogramas por segundo | Modelo demasiado pesado | Desactiva la luz de acento; reduce la resolución del modelo |

---

## Documentación completa

Ver `specs/001-ar-internal-world/quickstart.md` para el checklist de QA manual completo, guía de calibración y detalle de solución de problemas.

---

## Versiones de librerías fijadas

| Librería | Versión | CDN |
|---|---|---|
| A-Frame | 1.5.0 | `https://aframe.io/releases/1.5.0/aframe.min.js` |
| MindAR image-aframe | 1.2.5 | jsDelivr `mindar-image-aframe.prod.js` |

Actualiza las versiones de forma deliberada y registra los nuevos valores en esta tabla.
