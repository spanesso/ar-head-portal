# Image targets — 8th Wall (v2.0)

8th Wall usa un formato distinto al `.mind` de MindAR. Hay que **recompilar `target.png`** antes de probar la rama 8th Wall.

## Pasos

Desde la raíz del proyecto (donde está `index.html`):

```bash
npx @8thwall/image-target-cli@latest
```

El CLI:
1. Detecta `assets/targets/target.png` (la imagen fuente)
2. Te pregunta el `name` del target — **escribir exactamente `marker`** (debe coincidir con `xrextras-named-image-target="name: marker"` en `index.html` y con el `fetch('./image-targets/marker.json')` en `js/app.js`)
3. Genera `image-targets/marker.json` con los features detectados

## Verificación

Tras compilar deberías ver:

```
ar-head-portal/
├── image-targets/
│   └── marker.json        ← este archivo NO está commiteado todavía
└── assets/targets/
    ├── target.png         ← imagen fuente (existente)
    ├── marker.mind        ← formato MindAR (heredado v1.x — NO se usa en v2.0)
    ├── marker_old.mind    ← idem
    └── README.md          ← este archivo
```

## Despliegue

`image-targets/marker.json` debe estar en el deploy a Netlify. Si haces drag-and-drop, asegúrate de incluir la carpeta `image-targets/`. Si usas Netlify CLI o git deploy, commit `image-targets/marker.json` en la rama (`8thwall-migration`).

## Calidad del target

Si el CLI reporta menos de ~30 features, la imagen tiene poca textura y va a tracker mal. Solución: usar una imagen con más detalle (alto contraste, esquinas marcadas, sin patrones repetitivos). Misma regla que para MindAR.

## Nota sobre el formato

El JSON contiene los features pre-procesados que el XR Engine de 8th Wall usa para detección. No es human-readable útil — solo data binaria serializada como JSON. No editar manualmente.
