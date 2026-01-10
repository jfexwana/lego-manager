// debug.js - Système de logs centralisé
const DEBUG_MODE = false; // Mettre à true en développement sinon false en production

function debug(...args) {
  if (DEBUG_MODE) console.log(...args);
}

function debugGroup(label) {
  if (DEBUG_MODE) console.group(label);
}

function debugGroupEnd() {
  if (DEBUG_MODE) console.groupEnd();
}

window.debug = debug;
window.debugGroup = debugGroup;
window.debugGroupEnd = debugGroupEnd;