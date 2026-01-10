// ================================
// auth.js - Version locale uniquement
// ================================

export default class LocalStorageManager {
  constructor(container) {
    this.container = container;
    this.render();
  }

  // ================================
  // Interface utilisateur pour export/import
  // ================================
  render() {
    this.container.innerHTML = `
      <div class="storage-container">
        <h4>Sauvegarde & Export Local</h4>
        
        <div class="storage-actions">
          <button id="export-btn" class="btn btn-primary">
            <i class="bi bi-download"></i> Exporter les données
          </button>
          <button id="import-btn" class="btn btn-secondary">
            <i class="bi bi-upload"></i> Importer les données
          </button>
          <input type="file" id="import-file" accept=".json" style="display: none;">
        </div>
      </div>
    `;

    this.exportBtn = this.container.querySelector('#export-btn');
    this.importBtn = this.container.querySelector('#import-btn');
    this.importFile = this.container.querySelector('#import-file');

    this.exportBtn.addEventListener('click', () => this.exportToFile());
    this.importBtn.addEventListener('click', () => this.importFile.click());
    this.importFile.addEventListener('change', (e) => this.importFromFile(e));
  }

  // ================================
  // Export des données vers un fichier JSON
  // ================================
  exportToFile() {
  try {
    // Récupérer les données depuis localStorage
    const unifiedData = localStorage.getItem('lego_unified_data_v2');
    const personalInventory = localStorage.getItem('lego_personal_inventory');
    const setsData = localStorage.getItem('lego_sets_data');
    
    const exportData = {
      unified_data: unifiedData ? JSON.parse(unifiedData) : null,
      legacy_inventory: personalInventory ? JSON.parse(personalInventory) : null,
      legacy_sets: setsData ? JSON.parse(setsData) : null,
      export_date: new Date().toISOString()
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `lego_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log('Données exportées avec succès');
  } catch (error) {
    console.error('Erreur lors de l\'export:', error);
    alert('Erreur lors de l\'export des données');
  }
}

  // ================================
  // Import des données depuis un fichier JSON
  // ================================
async importFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    if (confirm('Voulez-vous vraiment importer ces données ? Cela remplacera vos données actuelles.')) {
      // Importer les données unifiées si disponibles
      if (importData.unified_data) {
        localStorage.setItem('lego_unified_data_v2', JSON.stringify(importData.unified_data));
      }
      
      // Importer les données legacy si nécessaire
      if (importData.legacy_inventory) {
        localStorage.setItem('lego_personal_inventory', JSON.stringify(importData.legacy_inventory));
      }
      
      if (importData.legacy_sets) {
        localStorage.setItem('lego_sets_data', JSON.stringify(importData.legacy_sets));
      }
      
      alert('Données importées avec succès ! Rechargez la page pour voir les changements.');
    }
  } catch (error) {
    console.error('Erreur lors de l\'import:', error);
    alert('Erreur lors de l\'import : fichier invalide');
  }
  
  event.target.value = '';
}
}