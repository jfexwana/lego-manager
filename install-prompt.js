// Gestion du bouton d'installation PWA
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  console.log('PWA installable');
  e.preventDefault();
  deferredPrompt = e;
  
  // Afficher un bouton d'installation personnalisé
  showInstallButton();
});

function showInstallButton() {
  const installBtn = document.getElementById('install-pwa-btn');
  if (installBtn) {
    installBtn.style.display = 'block';
    installBtn.addEventListener('click', installPWA);
  }
}

async function installPWA() {
  if (!deferredPrompt) return;
  
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  
  console.log(`Installation: ${outcome}`);
  deferredPrompt = null;
  
  const installBtn = document.getElementById('install-pwa-btn');
  if (installBtn) installBtn.style.display = 'none';
}

// Vérifier si déjà installé
window.addEventListener('appinstalled', () => {
  console.log('PWA installée avec succès');
  deferredPrompt = null;
});