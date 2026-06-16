/* ════════════════════════════════════════════════════════════════
   NÚCLEO HOME — asistente.js
   Archivo compartido de reconocimiento y síntesis de voz.
   Se incluye en TODAS las pantallas con:
   <script src="asistente.js"></script>

   Cada pantalla puede tener o no estos elementos opcionales:
   - <body> con clases 'escuchando' / 'respondiendo' para animar el círculo
   - <div id="estado">           → texto de estado (Esperando / Escuchando...)
   - <div id="globo">            → globo de texto con la respuesta
   - <button id="btnMic">        → botón de mantener presionado para hablar
   - <div id="modalPanico">      → modal de confirmación de emergencia

   Si alguno no existe en la pantalla, el script simplemente lo ignora.
   ════════════════════════════════════════════════════════════════ */


/* ── RECONOCIMIENTO DE VOZ ─────────────────────────────────────── */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconocimiento = null;

if (SpeechRecognition) {
  reconocimiento = new SpeechRecognition();
  reconocimiento.lang = 'es-AR';
  reconocimiento.continuous = false;
  reconocimiento.interimResults = false;

  reconocimiento.onstart = () => setEstado('escuchando');

  reconocimiento.onresult = (evento) => {
    const textoEscuchado = evento.results[0][0].transcript;
    procesarComando(textoEscuchado);
  };

  reconocimiento.onend = () => {
    if (document.body.classList.contains('escuchando')) {
      setEstado('esperando');
    }
    const btn = document.getElementById('btnMic');
    if (btn) btn.classList.remove('activo');
  };

  reconocimiento.onerror = () => {
    setEstado('esperando');
    mostrarGlobo('No pude escucharte. Intentá de nuevo.');
    const btn = document.getElementById('btnMic');
    if (btn) btn.classList.remove('activo');
  };
}


/* ── MANTENER PRESIONADO PARA HABLAR (estilo WhatsApp) ─────────── */
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


/* ── SÍNTESIS DE VOZ ────────────────────────────────────────────── */
function hablar(texto) {
  if (!window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = 'es-AR';
  utterance.rate = 0.95;
  utterance.pitch = 1;

  utterance.onend = () => setEstado('esperando');

  window.speechSynthesis.speak(utterance);
}


/* ── GLOBO DE TEXTO ─────────────────────────────────────────────── */
let timerGlobo = null;
function mostrarGlobo(texto) {
  const globo = document.getElementById('globo');
  if (!globo) return; // esta pantalla no tiene globo

  globo.textContent = texto;
  globo.classList.add('visible');

  clearTimeout(timerGlobo);
  timerGlobo = setTimeout(() => {
    globo.classList.remove('visible');
  }, 6000);
}


/* ── ESTADO DEL CÍRCULO ─────────────────────────────────────────── */
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


/* ── MAPA DE NAVEGACIÓN POR VOZ ─────────────────────────────────── */
// Cada ambiente puede tener varias formas de nombrarlo.
// La clave es el archivo de destino, el valor es la lista de palabras que lo activan.
const MAPA_AMBIENTES = {
  'ambiente.html?id=habitacion-principal': ['habitación principal', 'habitacion principal', 'dormitorio principal', 'cuarto principal'],
  'ambiente.html?id=habitacion-secundaria': ['habitación secundaria', 'habitacion secundaria', 'dormitorio secundario', 'segundo cuarto', 'segunda habitación'],
  'ambiente.html?id=cocina': ['cocina'],
  'ambiente.html?id=living': ['living', 'sala', 'sala de estar'],
  'ambiente.html?id=bano': ['baño', 'bano'],
  'ambiente.html?id=patio-trasero': ['patio trasero', 'patio de atrás', 'patio de atras', 'fondo'],
  'ambiente.html?id=patio-delantero': ['patio delantero', 'patio de adelante', 'frente'],
  'ambiente.html?id=galeria-lateral': ['galería lateral', 'galeria lateral', 'galería', 'galeria'],
};

// Páginas generales del sistema
const MAPA_PANTALLAS = {
  'principal.html': ['inicio', 'pantalla principal', 'menú principal', 'menu principal', 'asistente'],
  'ambientes.html': ['ambientes', 'ver ambientes', 'lista de ambientes', 'habitaciones'],
  'alarma.html': ['alarma', 'pantalla de alarma', 'sistema de alarma'],
};


/* ── PROCESAR COMANDO DE VOZ ────────────────────────────────────── */
// Esta función intenta primero detectar comandos de NAVEGACIÓN.
// Si no es un comando de navegación, lo deja como comando de DISPOSITIVOS
// (que más adelante se conectará con el servidor Railway).
function procesarComando(texto) {
  setEstado('respondiendo');
  const cmd = texto.toLowerCase().trim();

  // ── 1. Comando "volver" ──
  if (cmd === 'volver' || cmd === 'atrás' || cmd === 'atras' || cmd === 'volver atrás') {
    responderYNavegar('Volviendo.', 'principal.html');
    return;
  }

  // ── 2. Comando "ir a ambiente X" o "abrir X" ──
  for (const [destino, alias] of Object.entries(MAPA_AMBIENTES)) {
    for (const palabra of alias) {
      if (cmd.includes(palabra)) {
        const nombreAmbiente = palabra.charAt(0).toUpperCase() + palabra.slice(1);
        responderYNavegar(`Abriendo ${nombreAmbiente}.`, destino);
        return;
      }
    }
  }

  // ── 3. Comando para ir a pantallas generales ──
  for (const [destino, alias] of Object.entries(MAPA_PANTALLAS)) {
    for (const palabra of alias) {
      if (cmd.includes(palabra)) {
        responderYNavegar(`Abriendo ${palabra}.`, destino);
        return;
      }
    }
  }

  // ── 4. Comandos de dispositivos (de prueba por ahora) ──
  let respuesta = '';
  if (cmd.includes('luz') && cmd.includes('encend')) {
    respuesta = 'Encendiendo la luz.';
  } else if (cmd.includes('luz') && (cmd.includes('apag'))) {
    respuesta = 'Apagando la luz.';
  } else if (cmd.includes('temperatura')) {
    respuesta = 'La temperatura es de 22 grados.';
  } else if (cmd.includes('alarma') && cmd.includes('activ')) {
    respuesta = 'Activando la alarma.';
  } else if (cmd.includes('alarma') && cmd.includes('desactiv')) {
    respuesta = 'Desactivando la alarma.';
  } else {
    respuesta = `Escuché: "${texto}". Pronto conectaré con tu casa.`;
  }

  mostrarGlobo(respuesta);
  hablar(respuesta);
}


/* ── RESPONDER POR VOZ Y LUEGO NAVEGAR ──────────────────────────── */
// Dice la frase en voz alta, muestra el globo, y cuando termina de hablar
// navega a la pantalla destino.
function responderYNavegar(frase, destino) {
  mostrarGlobo(frase);

  if (!window.speechSynthesis) {
    window.location.href = destino;
    return;
  }

  const utterance = new SpeechSynthesisUtterance(frase);
  utterance.lang = 'es-AR';
  utterance.rate = 0.95;

  utterance.onend = () => {
    window.location.href = destino;
  };

  window.speechSynthesis.speak(utterance);
}


/* ── PÁNICO (compartido en todas las pantallas) ─────────────────── */
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
  // Próximamente: conectar con servidor para enviar WhatsApp y activar alarma
  mostrarGlobo('Alerta de emergencia enviada.');
  hablar('Alerta de emergencia enviada.');
}