# ════════════════════════════════════════════════════════════════
# NÚCLEO Home — servidor.py
# Servidor WebSocket central que conecta el dashboard (GitHub Pages)
# con el ESP32 Maestro dentro de la casa.
#
# Cómo funciona:
#   1. El ESP32 se conecta a este servidor y queda "escuchando"
#   2. El dashboard también se conecta y queda "escuchando"
#   3. Cuando el dashboard manda un comando, el servidor lo reenvía al ESP32
#   4. Cuando el ESP32 manda datos, el servidor los reenvía al dashboard
#   5. Todo los mensajes viajan en formato JSON
#
# Para correr localmente (prueba en tu PC):
#   pip install websockets
#   python servidor.py
#
# Para correr en Render:
#   Este archivo se sube al repositorio de GitHub y Render lo ejecuta solo.
# ════════════════════════════════════════════════════════════════

import asyncio        # Permite manejar múltiples conexiones al mismo tiempo
import websockets     # Librería para comunicación WebSocket
import json           # Para leer y escribir mensajes en formato JSON
import logging        # Para registrar eventos y errores en la consola
import os             # Para leer variables de entorno (como el puerto de Render)

# ── CONFIGURACIÓN DE LOGS ────────────────────────────────────────
# Muestra mensajes con fecha y hora en la consola de Render
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s — %(levelname)s — %(message)s'
)
log = logging.getLogger(__name__)

# ── REGISTRO DE CLIENTES CONECTADOS ─────────────────────────────
# Guardamos las conexiones activas en dos variables separadas
# para saber quién es el dashboard y quién es el ESP32

dashboard = None   # Conexión del navegador (GitHub Pages)
esp32     = None   # Conexión del ESP32 Maestro

# ── FUNCIÓN PRINCIPAL — maneja cada cliente que se conecta ───────
async def manejar_conexion(websocket):
    global dashboard, esp32

    # El primer mensaje que manda un cliente debe identificarse
    # Esperamos ese mensaje de identificación
    try:
        mensaje_inicial = await websocket.recv()
        datos = json.loads(mensaje_inicial)   # Convertimos el texto JSON a diccionario Python

        # El cliente debe mandar: {"tipo": "dashboard"} o {"tipo": "esp32"}
        tipo = datos.get("tipo", "desconocido")

    except Exception as e:
        log.warning(f"Error en identificación de cliente: {e}")
        await websocket.close()
        return

    # ── Cliente es el DASHBOARD ──────────────────────────────────
    if tipo == "dashboard":
        dashboard = websocket
        log.info("✅ Dashboard conectado")

        # Avisamos al dashboard que la conexión fue exitosa
        await websocket.send(json.dumps({
            "tipo": "estado",
            "mensaje": "Conectado a NÚCLEO Home"
        }))

        try:
            # Escuchamos mensajes del dashboard indefinidamente
            async for mensaje in websocket:
                log.info(f"Dashboard → ESP32: {mensaje}")

                # Si el ESP32 está conectado, le reenviamos el mensaje
                if esp32:
                    await esp32.send(mensaje)
                else:
                    # Si el ESP32 no está conectado, avisamos al dashboard
                    await websocket.send(json.dumps({
                        "tipo": "error",
                        "mensaje": "ESP32 no conectado"
                    }))

        except websockets.exceptions.ConnectionClosed:
            log.info("Dashboard desconectado")
        finally:
            dashboard = None   # Limpiamos la variable cuando se desconecta

    # ── Cliente es el ESP32 ──────────────────────────────────────
    elif tipo == "esp32":
        esp32 = websocket
        log.info("✅ ESP32 conectado")

        # Avisamos al dashboard que el ESP32 está disponible
        if dashboard:
            await dashboard.send(json.dumps({
                "tipo": "estado",
                "mensaje": "ESP32 conectado"
            }))

        try:
            # Escuchamos mensajes del ESP32 indefinidamente
            async for mensaje in websocket:
                log.info(f"ESP32 → Dashboard: {mensaje}")

                # Si el dashboard está conectado, le reenviamos el mensaje
                if dashboard:
                    await dashboard.send(mensaje)

        except websockets.exceptions.ConnectionClosed:
            log.info("ESP32 desconectado")
            # Avisamos al dashboard que el ESP32 se desconectó
            if dashboard:
                await dashboard.send(json.dumps({
                    "tipo": "error",
                    "mensaje": "ESP32 desconectado"
                }))
        finally:
            esp32 = None   # Limpiamos la variable cuando se desconecta

    # ── Cliente desconocido ──────────────────────────────────────
    else:
        log.warning(f"Cliente desconocido: {tipo}")
        await websocket.close()

# ── FUNCIÓN PING — mantiene vivas las conexiones ─────────────────
# WebSocket puede cerrarse si no hay actividad. Esta función manda
# un "ping" silencioso a los clientes conectados cada 30 segundos.
async def ping_periodico():
    while True:
        await asyncio.sleep(30)   # Espera 30 segundos

        # Manda ping al dashboard si está conectado
        if dashboard:
            try:
                await dashboard.ping()
            except:
                pass

        # Manda ping al ESP32 si está conectado
        if esp32:
            try:
                await esp32.ping()
            except:
                pass

# ── INICIO DEL SERVIDOR ──────────────────────────────────────────
async def main():
    # Render asigna el puerto automáticamente mediante la variable PORT
    # En tu PC local usa el puerto 8765 por defecto
    puerto = int(os.environ.get("PORT", 8765))

    log.info(f"🚀 NÚCLEO Home servidor iniciando en puerto {puerto}")

    # Iniciamos el ping periódico en paralelo con el servidor
    asyncio.create_task(ping_periodico())

    # Iniciamos el servidor WebSocket
    # "0.0.0.0" significa que acepta conexiones desde cualquier dirección
    async with websockets.serve(manejar_conexion, "0.0.0.0", puerto):
        log.info("✅ Servidor listo y esperando conexiones")
        await asyncio.Future()   # Mantiene el servidor corriendo para siempre

# ── PUNTO DE ENTRADA ─────────────────────────────────────────────
if __name__ == "__main__":
    asyncio.run(main())