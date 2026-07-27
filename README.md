# Nest Hub Monitor

Dashboard pixel-art de monitoreo de Claude Code, pensado para castearse a un
Google Nest Hub 2ª gen (viewport 1024×600, touch). Muestra en tiempo real las
sesiones activas de la Mac, los eventos importantes (con chiptunes 8-bit), el
consumo de la suscripción vía ccusage, y permite **aprobar/denegar permisos
tocando la pantalla del Hub**.

## Requisitos

- Node.js (sin dependencias npm; el servidor es HTTP nativo)
- [catt](https://github.com/skorokithakis/catt) para castear: `pipx install catt` (o `pip install catt`)
- ccusage se ejecuta solo vía `npx` (no hay que instalarlo)

## Uso

```sh
npm run install-hooks   # registra los hooks en ~/.claude/settings.json (merge aditivo + backup)
npm start               # servidor en http://0.0.0.0:8787
npm run cast            # castea al Nest Hub (usa la IP LAN de la Mac)
npm run keepalive       # re-castea si el Hub vuelve a su pantalla ambiente (~10 min)
```

- El nombre del dispositivo se configura en `config.json` (`device`) o con `CATT_DEVICE`; descúbrelo con `catt scan`.
- Los hooks aplican a sesiones de Claude Code **nuevas**; las ya abiertas no los recargan.
- `npm run uninstall-hooks` quita solo nuestras entradas y deja el resto intacto.
- La primera vez, macOS pedirá permitir conexiones entrantes para `node`: acepta (el Hub debe alcanzar la Mac).

## Aprobación remota

El toggle **REMOTO** del dashboard controla el flujo:

- **OFF** (default): los hooks responden en milisegundos y todo funciona como siempre (prompt en terminal).
- **ON**: cuando una sesión pide usar Bash/Write/Edit, aparece una tarjeta en el
  Hub con botones APROBAR/DENEGAR y una cuenta regresiva de 28s. Si no respondes,
  la solicitud cae al prompt normal de la terminal — nunca queda bloqueada.
- Si el servidor está caído, los hooks son fail-open: Claude Code ni se entera.

## Sonidos

Chiptunes generados con WebAudio (sin archivos): arpegio al iniciar sesión,
fanfarria al terminar una tarea, doble bip al pedir input, alerta insistente en
aprobaciones, descendente grave en errores. Si el receiver bloquea el autoplay,
aparece el chip "TOCA P/SONIDO": un toque en la pantalla lo desbloquea.
Mantén presionado el logo ~1s para probar todos los jingles.

## Fuentes de datos de consumo

- **% de los límites del plan** (bloque 5h, semanal todos, semanal Fable): el
  endpoint OAuth `api.anthropic.com/api/oauth/usage` — los mismos números que
  muestra `/usage` en Claude Code. El token se lee del Keychain
  (`security find-generic-password -s "Claude Code-credentials"`) en runtime,
  solo vive en memoria del servidor y nunca se loguea. Si el Keychain no está
  disponible, las barras caen al fallback de estimaciones ccusage.
- **Dólares y tokens**: estimaciones locales de ccusage (equivalente costo API),
  mostradas junto a cada barra.

## Limitaciones conocidas
- El desglose por proyecto no está disponible en el ccusage actual (sus
  sesiones son UUIDs sin ruta), por eso el panel no lo incluye.
- La tarjeta de aprobación muestra el comando original, antes de la reescritura
  de rtk (los hooks PreToolUse corren en paralelo).
- El estado del servidor vive en memoria: al reiniciarlo se pierde el historial
  de eventos (las sesiones reaparecen con su siguiente evento).
