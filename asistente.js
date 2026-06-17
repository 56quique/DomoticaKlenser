/* ════════════════════════════════════════════════════════════════
   NÚCLEO Home — asistente.js
   Archivo compartido de reconocimiento y síntesis de voz.
   Se incluye en TODAS las pantallas con:
   <script src="asistente.js"></script>

   Ahora incluye conexión WebSocket con el servidor en Render.
   El flujo es:
     1. La app abre conexión con el servidor al cargar
     2. Se identifica como "dashboard"
     3. Cuando el usuario habla, manda el comando al servidor
     4. El servidor lo reenvía al ESP32
     5. El ESP32 responde y el servidor reenvía la respuesta al dashboard
     6. El dashboard muestra y dice la respuesta en voz alta
   ════════════════════════════════════════════════════════════════ */


/* ── CONFIGURACIÓN ──────────────────────────────────────────────
   Cambiá esta URL si en el futuro cambiás de servidor           */
const URL_SERVIDOR = 'wss://domoticaklenser.onrender.com';
/* ────────────────────────────────────────────────────────────── */


/* ── CONEXIÓN WEBSOCKET ─────────────────────────────────────────
   ws es la conexión con el servidor. Se abre al cargar la página
   y se mantiene abierta mientras el usuario está en el dashboard */
let ws = null;

function conectarServidor() {
  // Crea la conexión WebSocket con el servidor
  ws = new WebSocket(URL_SERVIDOR);

  // Cuando la conexión se abre exitosamente
  ws.onopen = () => {
    console.log('✅ Conectado al servidor NÚCLEO Home');

    // Le decimos al servidor que somos el dashboard
    ws.send(JSON.stringify({ tipo: 'dashboard' }));
  };

  // Cuando llega un mensaje del servidor (que viene del ESP32)
  ws.onmessage = (evento) => {
    try {
      const datos = JSON.parse(evento.data);   // Convertimos el JSON a objeto

      if (datos.tipo === 'respuesta') {
        // El ESP32 respondió con una acción ejecutada
        setEstado('respondiendo');
        mostrarGlobo(datos.mensaje);
        hablar(datos.mensaje);

      } else if (datos.tipo === 'estado') {
        // El servidor nos informa sobre el estado de la conexión
        console.log('Estado servidor:', datos.mensaje);

      } else if (datos.tipo === 'error') {
        // Algo salió mal en el servidor o el ESP32 no está conectado
        setEstado('esperando');
        mostrarGlobo(datos.mensaje);
        hablar(datos.mensaje);
      }

    } catch (e) {
      console.error('Error procesando mensaje del servidor:', e);
    }
  };

  // Cuando la conexión se cierra (por inactividad o error)
  ws.onclose = () => {
    console.log('Conexión cerrada, reintentando en 5 segundos...');
    // Reintenta conectar automáticamente después de 5 segundos
    setTimeout(conectarServidor, 5000);
  };

  // Si hay un error de conexión
  ws.onerror = (error) => {
    console.error('Error WebSocket:', error);
  };
}

// Inicia la conexión al cargar la página
conectarServidor();


/* ── RECONOCIMIENTO DE VOZ ──────────────────────────────────────
   Usa la Web Speech API nativa de Android/Chrome               */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconocimiento = null;

if (SpeechRecognition) {
  reconocimiento = new SpeechRecognition();
  reconocimiento.lang = 'es-AR';        // Español Argentina
  reconocimiento.continuous = false;     // Escucha una frase y para
  reconocimiento.interimResults = false; // Solo resultado final

  // Cuando empieza a escuchar
  reconocimiento.onstart = () => setEstado('escuchando');

  // Cuando obtiene el texto hablado
  reconocimiento.onresult = (evento) => {
    const textoEscuchado = evento.results[0][0].transcript;
    procesarComando(textoEscuchado);
  };

  // Cuando termina de escuchar
  reconocimiento.onend = () => {
    if (document.body.classList.contains('escuchando')) {
      setEstado('esperando');
    }
    const btn = document.getElementById('btnMic');
    if (btn) btn.classList.remove('activo');
  };

  // Si hay error de reconocimiento
  reconocimiento.onerror = () => {
    setEstado('esperando');
    mostrarGlobo('No pude escucharte. Intentá de nuevo.');
    const btn = document.getElementById('btnMic');
    if (btn) btn.classList.remove('activo');
  };
}


/* ── MANTENER PRESIONADO PARA HABLAR (estilo WhatsApp) ─────────*/
function iniciarVoz(e) {
  if (e) e.preventDefault();
  if (!reconocimiento) {
    mostrarGlobo('Tu navegador no soporta reconocimiento de voz.');
    return;
  }
  const btn = document.getElementById('btnMic');
  if (btn) btn.classList.add('activo');
  try { reconocimiento.start(); } catch (err) {}
}

function detenerVoz() {
  const btn = document.getElementById('btnMic');
  if (btn) btn.classList.remove('activo');
  try { reconocimiento.stop(); } catch (err) {}
}


/* ── SÍNTESIS DE VOZ ────────────────────────────────────────────
   El asistente habla la respuesta en español argentino          */
function hablar(texto) {
  if (!window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = 'es-AR';
  utterance.rate = 0.95;   // Velocidad ligeramente reducida para ancianos
  utterance.pitch = 1;

  utterance.onend = () => setEstado('esperando');

  window.speechSynthesis.speak(utterance);
}


/* ── GLOBO DE TEXTO ─────────────────────────────────────────────
   Muestra la respuesta en pantalla y desaparece a los 6 segundos */
let timerGlobo = null;
function mostrarGlobo(texto) {
  const globo = document.getElementById('globo');
  if (!globo) return;

  globo.textContent = texto;
  globo.classList.add('visible');

  clearTimeout(timerGlobo);
  timerGlobo = setTimeout(() => {
    globo.classList.remove('visible');
  }, 6000);
}


/* ── ESTADO DEL CÍRCULO ─────────────────────────────────────────
   Cambia el color del círculo según el estado del asistente     */
function setEstado(estado) {
  const body = document.body;
  const etiqueta = document.getElementById('estado');

  body.classList.remove('escuchando', 'respondiendo');

  if (estado === 'escuchando') {
    body.classList.add('escuchando');
    if (etiqueta) { etiqueta.textContent = 'Escuchando...'; etiqueta.className = 'estado escuchando'; }
  } else if (estado === 'respondiendo') {
    body.classList.add('respondiendo');
    if (etiqueta) { etiqueta.textContent = 'Respondiendo...'; etiqueta.className = 'estado respondiendo'; }
  } else {
    if (etiqueta) { etiqueta.textContent = 'Esperando...'; etiqueta.className = 'estado'; }
  }
}


/* ── MAPA DE NAVEGACIÓN POR VOZ ─────────────────────────────────
   Define qué palabras activan la navegación a cada pantalla     */
const MAPA_AMBIENTES = {
  'ambiente.html?id=habitacion-principal':  ['habitación principal', 'habitacion principal', 'dormitorio principal', 'cuarto principal'],
  'ambiente.html?id=habitacion-secundaria': ['habitación secundaria', 'habitacion secundaria', 'dormitorio secundario', 'segundo cuarto'],
  'ambiente.html?id=cocina':                ['cocina'],
  'ambiente.html?id=living':                ['living', 'sala', 'sala de estar'],
  'ambiente.html?id=bano':                  ['baño', 'bano'],
  'ambiente.html?id=patio-trasero':         ['patio trasero', 'patio de atrás', 'fondo'],
  'ambiente.html?id=patio-delantero':       ['patio delantero', 'patio de adelante', 'frente'],
  'ambiente.html?id=galeria-lateral':       ['galería lateral', 'galeria lateral', 'galería', 'galeria'],
};

const MAPA_PANTALLAS = {
  'principal.html': ['inicio', 'pantalla principal', 'menú principal', 'asistente'],
  'ambientes.html': ['ambientes', 'ver ambientes', 'habitaciones'],
  'alarma.html':    ['alarma', 'pantalla de alarma'],
};


/* ── PROCESAR COMANDO DE VOZ ────────────────────────────────────
   Primero intenta navegación local. Si no es navegación,
   manda el comando al servidor para que lo procese el ESP32     */
function procesarComando(texto) {
  setEstado('respondiendo');
  const cmd = texto.toLowerCase().trim();

  // ── 1. Comando "volver" ──
  if (cmd === 'volver' || cmd === 'atrás' || cmd === 'atras') {
    responderYNavegar('Volviendo.', 'principal.html');
    return;
  }

  // ── 2. Navegar a un ambiente por voz ──
  for (const [destino, alias] of Object.entries(MAPA_AMBIENTES)) {
    for (const palabra of alias) {
      if (cmd.includes(palabra)) {
        const nombre = palabra.charAt(0).toUpperCase() + palabra.slice(1);
        responderYNavegar(`Abriendo ${nombre}.`, destino);
        return;
      }
    }
  }

  // ── 3. Navegar a pantallas generales ──
  for (const [destino, alias] of Object.entries(MAPA_PANTALLAS)) {
    for (const palabra of alias) {
      if (cmd.includes(palabra)) {
        responderYNavegar(`Abriendo ${palabra}.`, destino);
        return;
      }
    }
  }

  // ── 4. Comando para el ESP32 — se manda al servidor ──
  // Si el servidor está conectado, mandamos el comando
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      tipo: 'comando',       // Tipo de mensaje
      texto: texto,          // Texto original que dijo el usuario
      comando: cmd           // Texto en minúsculas para procesar
    }));
    // Mientras esperamos respuesta del ESP32 mostramos un mensaje
    mostrarGlobo('Procesando...');
  } else {
    // Si no hay conexión con el servidor, respondemos localmente
    mostrarGlobo('Sin conexión con el servidor.');
    hablar('Sin conexión con el servidor.');
  }
}


/* ── RESPONDER POR VOZ Y NAVEGAR ────────────────────────────────
   Dice la frase, muestra el globo, y navega cuando termina      */
function responderYNavegar(frase, destino) {
  mostrarGlobo(frase);

  if (!window.speechSynthesis) {
    window.location.href = destino;
    return;
  }

  const utterance = new SpeechSynthesisUtterance(frase);
  utterance.lang = 'es-AR';
  utterance.rate = 0.95;
  utterance.onend = () => { window.location.href = destino; };
  window.speechSynthesis.speak(utterance);
}


/* ── PÁNICO ─────────────────────────────────────────────────────
   Botón de emergencia disponible en todas las pantallas         */
function mostrarPanico() {
  const modal = document.getElementById('modalPanico');
  if (modal) modal.classList.add('visible');
}
function cerrarPanico() {
  const modal = document.getElementById('modalPanico');
  if (modal) modal.classList.remove('visible');
}
function confirmarPanico() {
  cerrarPanico();
  // Manda alerta de pánico al servidor para que notifique por WhatsApp
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ tipo: 'panico' }));
  }
  mostrarGlobo('Alerta de emergencia enviada.');
  hablar('Alerta de emergencia enviada.');
}