# ════════════════════════════════════════════════════════════════
# NÚCLEO Home — servidor.py
# Servidor WebSocket central que conecta el dashboard (GitHub Pages)
# con el ESP32 Maestro dentro de la casa.
#
# Tipos de mensaje que maneja:
#   Dashboard → Servidor:
#     {"tipo": "dashboard"}           → identificación inicial
#     {"tipo": "comando", "texto": "encendé la luz", "comando": "encendé la luz"}
#     {"tipo": "panico"}              → alerta de emergencia
#
#   ESP32 → Servidor:
#     {"tipo": "esp32"}               → identificación inicial
#     {"tipo": "respuesta", "mensaje": "Luz encendida"}
#     {"tipo": "datos", "temperatura": 22, "humedad": 60}
#
#   Servidor → Dashboard:
#     {"tipo": "estado", "mensaje": "Conectado"}
#     {"tipo": "respuesta", "mensaje": "Luz encendida"}
#     {"tipo": "error", "mensaje": "ESP32 no conectado"}
#
#   Servidor → ESP32:
#     {"tipo": "comando", "texto": "encendé la luz", "comando": "encendé la luz"}
#     {"tipo": "panico"}
# ════════════════════════════════════════════════════════════════

import asyncio
import websockets
import json
import logging
import os

# ── CONFIGURACIÓN DE LOGS ────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s — %(levelname)s — %(message)s'
)
log = logging.getLogger(__name__)

# ── CLIENTES CONECTADOS ──────────────────────────────────────────
dashboard = None   # Conexión del navegador (GitHub Pages)
esp32     = None   # Conexión del ESP32 Maestro

# ── MANEJO DE CADA CLIENTE ───────────────────────────────────────
async def manejar_conexion(websocket):
    global dashboard, esp32

    # Esperamos el mensaje de identificación
    try:
        mensaje_inicial = await websocket.recv()
        datos = json.loads(mensaje_inicial)
        tipo  = datos.get("tipo", "desconocido")
    except Exception as e:
        log.warning(f"Error en identificación: {e}")
        await websocket.close()
        return

    # ── Cliente DASHBOARD ────────────────────────────────────────
    if tipo == "dashboard":
        dashboard = websocket
        log.info("✅ Dashboard conectado")

        # Informamos al dashboard que la conexión fue exitosa
        await enviar(dashboard, {
            "tipo": "estado",
            "mensaje": "Conectado a NÚCLEO Home"
        })

        # Si el ESP32 ya estaba conectado, se lo informamos al dashboard
        if esp32:
            await enviar(dashboard, {
                "tipo": "estado",
                "mensaje": "ESP32 conectado"
            })

        try:
            async for mensaje in websocket:
                await procesar_mensaje_dashboard(mensaje)
        except websockets.exceptions.ConnectionClosed:
            log.info("Dashboard desconectado")
        finally:
            dashboard = None

    # ── Cliente ESP32 ────────────────────────────────────────────
    elif tipo == "esp32":
        esp32 = websocket
        log.info("✅ ESP32 conectado")

        # Avisamos al dashboard que el ESP32 está disponible
        if dashboard:
            await enviar(dashboard, {
                "tipo": "estado",
                "mensaje": "ESP32 conectado"
            })

        try:
            async for mensaje in websocket:
                await procesar_mensaje_esp32(mensaje)
        except websockets.exceptions.ConnectionClosed:
            log.info("ESP32 desconectado")
            if dashboard:
                await enviar(dashboard, {
                    "tipo": "error",
                    "mensaje": "ESP32 desconectado"
                })
        finally:
            esp32 = None

    else:
        log.warning(f"Cliente desconocido: {tipo}")
        await websocket.close()


# ── PROCESAR MENSAJES DEL DASHBOARD ─────────────────────────────
async def procesar_mensaje_dashboard(mensaje):
    try:
        datos = json.loads(mensaje)
        tipo  = datos.get("tipo", "")
        log.info(f"Dashboard → Servidor: {datos}")

        # Comando de voz del usuario
        if tipo == "comando":
            if esp32:
                # Reenviamos el comando al ESP32
                await enviar(esp32, datos)
            else:
                # El ESP32 no está conectado, avisamos al dashboard
                await enviar(dashboard, {
                    "tipo": "respuesta",
                    "mensaje": "No hay conexión con la casa. Verificá que el sistema esté encendido."
                })

        # Botón de pánico
        elif tipo == "panico":
            log.warning("🚨 ALERTA DE PÁNICO recibida")
            if esp32:
                # Le mandamos la alerta al ESP32 para que active la alarma
                await enviar(esp32, {"tipo": "panico"})
            # Confirmamos al dashboard
            await enviar(dashboard, {
                "tipo": "respuesta",
                "mensaje": "Alerta de emergencia enviada."
            })

    except Exception as e:
        log.error(f"Error procesando mensaje del dashboard: {e}")


# ── PROCESAR MENSAJES DEL ESP32 ──────────────────────────────────
async def procesar_mensaje_esp32(mensaje):
    try:
        datos = json.loads(mensaje)
        tipo  = datos.get("tipo", "")
        log.info(f"ESP32 → Servidor: {datos}")

        # El ESP32 confirma que ejecutó una acción
        if tipo == "respuesta":
            if dashboard:
                await enviar(dashboard, datos)

        # El ESP32 manda datos de sensores (temperatura, humedad, etc.)
        elif tipo == "datos":
            if dashboard:
                await enviar(dashboard, datos)

    except Exception as e:
        log.error(f"Error procesando mensaje del ESP32: {e}")


# ── FUNCIÓN AUXILIAR PARA ENVIAR MENSAJES ────────────────────────
# Convierte el diccionario a JSON y lo manda por WebSocket
async def enviar(cliente, datos):
    try:
        await cliente.send(json.dumps(datos))
    except Exception as e:
        log.error(f"Error enviando mensaje: {e}")


# ── PING PERIÓDICO ───────────────────────────────────────────────
# Mantiene vivas las conexiones mandando un ping cada 30 segundos
async def ping_periodico():
    while True:
        await asyncio.sleep(30)
        if dashboard:
            try: await dashboard.ping()
            except: pass
        if esp32:
            try: await esp32.ping()
            except: pass


# ── INICIO DEL SERVIDOR ──────────────────────────────────────────
async def main():
    puerto = int(os.environ.get("PORT", 8765))
    log.info(f"🚀 NÚCLEO Home servidor iniciando en puerto {puerto}")

    asyncio.create_task(ping_periodico())

    async with websockets.serve(manejar_conexion, "0.0.0.0", puerto):
        log.info("✅ Servidor listo y esperando conexiones")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())