// unified-data-manager.js - Gestionnaire de données unifié

// Supprimer cette ligne problématique : <script src="debug.js"></script>
// À la place, ajouter cette vérification pour debug.js
if (typeof debug === 'undefined') {
  // Définir des fonctions debug factices si debug.js n'est pas chargé
  var debug = function(...args) {
    if (console && console.log) console.log(...args);
  };
  var debugGroup = function(...args) {
    if (console && console.group) console.group(...args);
  };
  var debugGroupEnd = function() {
    if (console && console.groupEnd) console.groupEnd();
  };
}
// unified-data-manager.js - Gestionnaire de données unifié
class UnifiedDataManager {
  constructor() {
    this.UNIFIED_SAVE_KEY = 'lego_unified_data_v2';
    this.inventoryToSetMap = new Map();
  
    this.currentData = {
      version: "2.0",
      timestamp: new Date().toISOString(),
      user: {
        preferences: {
          theme: 'light',
          autoSave: true,
          apiKey: localStorage.getItem('rebrickable_api_key') || ''
        }
      },
      inventory: [],
      sets: [],
      analysisCache: {
        rareParts: [],
        possibleSets: [],
        lastInventoryHash: null,
        lastSetsHash: null,
        timestamp: null
      }
    };
  }

  getInventoryHash() {
    const inventoryString = this.currentData.inventory
      .map(i => `${i.part_num}_${i.color_id}_${i.quantity}`)
      .sort()
      .join('|');
    return this.simpleHash(inventoryString);
  }

  getSetsHash() {
    const setsString = this.currentData.sets
      .map(s => `${s.number}_${s.parts.map(p => `${p.part_num}_${p.color_id}_${p.quantity_owned}`).join(',')}`)
      .sort()
      .join('|');
    return this.simpleHash(setsString);
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  async loadInventoryMapping() {
    if (!window.db) {
      console.warn('IndexedDB non disponible');
      return;
    }
    
    try {
      const inventories = await window.db.getData('inventories');
      this.inventoryToSetMap = new Map();
      
      inventories.forEach(inv => {
        this.inventoryToSetMap.set(parseInt(inv.id), inv.set_num);
      });
      
      debug(`✓ ${this.inventoryToSetMap.size} mappings inventory→set chargés`);
    } catch (error) {
      console.error('Erreur chargement mapping inventories:', error);
      this.inventoryToSetMap = new Map();
    }
  }

  getSetNumFromInventory(inventoryId) {
    const setNum = this.inventoryToSetMap.get(parseInt(inventoryId));
    if (!setNum) {
      console.warn(`Aucun set_num trouvé pour inventory_id: ${inventoryId}`);
      return null;
    }
    return setNum;
  }

  getInventoryFromSetNum(setNum) {
    for (const [invId, sNum] of this.inventoryToSetMap.entries()) {
      if (sNum === setNum) {
        return invId;
      }
    }
    console.warn(`Aucun inventory_id trouvé pour set_num: ${setNum}`);
    return null;
  }

  isRealSet(inventoryId) {
    const setNum = this.getSetNumFromInventory(inventoryId);
    return setNum && setNum.includes('-');
  }

  async saveAnalysisCache(rareParts, possibleSets) {
    this.currentData.analysisCache = {
      rareParts,
      possibleSets,
      lastInventoryHash: this.getInventoryHash(),
      lastSetsHash: this.getSetsHash(),
      timestamp: Date.now()
    };
    
    if (window.db) {
      await window.db.saveMetadata('analysis_cache', this.currentData.analysisCache);
    }
  }

  async loadAnalysisCache() {
    if (window.db) {
      const cached = await window.db.getMetadata('analysis_cache');
      if (cached) {
        this.currentData.analysisCache = cached;
        return true;
      }
    }
    return false;
  }

  isAnalysisCacheValid() {
    const cache = this.currentData.analysisCache;
    if (!cache || !cache.lastInventoryHash || !cache.lastSetsHash) {
      return false;
    }
    
    const currentInventoryHash = this.getInventoryHash();
    const currentSetsHash = this.getSetsHash();
    
    return cache.lastInventoryHash === currentInventoryHash && 
           cache.lastSetsHash === currentSetsHash;
  }

  invalidateAnalysisCache() {
    this.currentData.analysisCache.lastInventoryHash = null;
    this.currentData.analysisCache.lastSetsHash = null;
  }

  cleanupLegacyStorage() {
    const legacyKeys = [
      'lego_personal_inventory',
      'lego_sets_data', 
      'GlobalBricks_Save_Bulk',
      'darkMode'
    ];
    
    legacyKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        debug(`Suppression de l'ancienne clé: ${key}`);
        localStorage.removeItem(key);
      }
    });
  }

  async getPartName(partNum) {
    try {
      if (window.legoDb) {
        const parts = await window.legoDb.getData('parts');
        const part = parts.find(p => p.part_num === partNum);
        return part ? part.name : 'Pièce inconnue';
      }
      return 'Pièce inconnue';
    } catch (error) {
      console.error('Erreur récupération nom pièce:', error);
      return 'Pièce inconnue';
    }
  }

  async loadUnifiedData() {
    try {
    if (window.db) {
      await this.loadInventoryMapping();
    }
      
      const saved = localStorage.getItem(this.UNIFIED_SAVE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        
        if (!data.version || data.version !== "2.0") {
          debug('Migration des données vers le format v2.0...');
          this.currentData = await this.migrateFromLegacyData(data);
        } else {
          this.currentData = data;
          if (!this.currentData.analysisCache) {
            this.currentData.analysisCache = {
              rareParts: [],
              possibleSets: [],
              lastInventoryHash: null,
              lastSetsHash: null,
              timestamp: null
            };
          }
        }
        
        debug('Données unifiées chargées:', this.currentData);
        return this.currentData;
      } else {
        debug('Première utilisation, migration depuis les anciens formats...');
        this.currentData = await this.migrateFromLegacyData();
        await this.saveUnifiedData();
        return this.currentData;
      }
    } catch (error) {
      console.error('Erreur chargement données unifiées:', error);
      return this.currentData;
    }
  }

  async getInventoryStats() {
    if (!window.db) return null;
    
    try {
      const allInventoryParts = await window.db.getData('inventory_parts');
      const inventoryGroups = new Map();
      
      allInventoryParts.forEach(ip => {
        if (!inventoryGroups.has(ip.inventory_id)) {
          inventoryGroups.set(ip.inventory_id, []);
        }
        inventoryGroups.get(ip.inventory_id).push(ip);
      });
      
      let realSetsCount = 0;
      let otherInventoriesCount = 0;
      
      for (const invId of inventoryGroups.keys()) {
        if (this.isRealSet(invId)) {
          realSetsCount++;
        } else {
          otherInventoriesCount++;
        }
      }
      
      return {
        totalInventories: inventoryGroups.size,
        realSets: realSetsCount,
        otherInventories: otherInventoriesCount,
        totalParts: allInventoryParts.length
      };
    } catch (error) {
      console.error('Erreur calcul stats inventories:', error);
      return null;
    }
  }

  async getAllRealSetNumbers() {
    const realSets = [];
    
    for (const [invId, setNum] of this.inventoryToSetMap.entries()) {
      if (setNum && setNum.includes('-')) {
        realSets.push({
          inventory_id: invId,
          set_num: setNum
        });
      }
    }
    
    return realSets.sort((a, b) => a.set_num.localeCompare(b.set_num));
  }

  async migrateFromLegacyData(existingData = null) {
    const newData = {
      version: "2.0",
      timestamp: new Date().toISOString(),
      user: {
        preferences: {
          theme: localStorage.getItem('darkMode') === 'true' ? 'dark' : 'light',
          autoSave: true,
          apiKey: localStorage.getItem('rebrickable_api_key') || ''
        }
      },
      inventory: [],
      sets: []
    };

    try {
      const oldInventory = localStorage.getItem('lego_personal_inventory');
      if (oldInventory) {
        const inventory = JSON.parse(oldInventory);
        let inventoryArray = [];
        
        if (Array.isArray(inventory)) {
          inventoryArray = inventory;
        } else if (typeof inventory === 'object') {
          inventoryArray = Object.values(inventory);
        }
        
        newData.inventory = await Promise.all(inventoryArray.map(async item => {
          let colorId = item.color_id;
          
          if (colorId === undefined || colorId === null) {
            colorId = await this.getColorIdByName(item.color_name);
          }
          
          return {
            part_num: item.part_num,
            color_id: colorId,
            color_name: item.color_name,
            quantity: item.quantity,
            category: item.category || 'Unknown'
          };      
        }));
      }

      const oldSets = localStorage.getItem('lego_sets_data');
      if (oldSets) {
        const setsData = JSON.parse(oldSets);
        if (setsData.sets && Array.isArray(setsData.sets)) {
          newData.sets = setsData.sets.map(set => ({
            number: set.number,
            name: set.name,
            parts: set.parts
              .filter(p => !p.isSpare)
              .map(p => ({
                part_num: p.partNum,
                color_id: p.colorId,
                quantity: p.quantity,
                quantity_owned: p.quantityOwned || 0
              }))
          }));
        }
      }

      debug('Migration terminée, données converties:', newData);
      return newData;
      
    } catch (error) {
      console.error('Erreur migration des données:', error);
      return newData;
    }
  }

  async saveUnifiedData() {
    try {
      this.currentData.timestamp = new Date().toISOString();
      const jsonData = JSON.stringify(this.currentData, null, 2);
      localStorage.setItem(this.UNIFIED_SAVE_KEY, jsonData);
      
      debug('Données unifiées sauvegardées');
      return true;
    } catch (error) {
      console.error('Erreur sauvegarde données unifiées:', error);
      return false;
    }
  }

  updateInventory(partNum, colorId, colorName, quantity, category = 'Unknown') {
  debugGroup('💾 UnifiedDataManager.updateInventory');
  debug('📦 Params:', { partNum, colorId, quantity, category });

    const index = this.currentData.inventory.findIndex(
      item => item.part_num === partNum && item.color_id === colorId
    );
  debug('🔍 Index trouvé:', index);

    if (quantity <= 0) {
      if (index >= 0) {
              debug('🗑️ Suppression de l\'item (quantité ≤ 0)');
        this.currentData.inventory.splice(index, 1);
      }
    } else {
      if (index >= 0) {
              debug('✏️ Mise à jour de l\'item existant');
        this.currentData.inventory[index].quantity = quantity;
        this.currentData.inventory[index].category = category;
      } else {
              debug('➕ Ajout d\'un nouvel item');
        this.currentData.inventory.push({
          part_num: partNum,
          color_id: colorId,
          color_name: colorName,
          quantity: quantity,
          category: category
        });
      }
    }
      // Vérifier la quantité finale
  const finalQty = this.getInventoryQuantity(partNum, colorId);
  debug('✅ Quantité finale dans inventory:', finalQty);

    this.invalidateAnalysisCache();
      debugGroupEnd();

  }

  getInventoryQuantity(partNum, colorId) {
    const item = this.currentData.inventory.find(
      item => item.part_num === partNum && item.color_id === colorId
    );
    return item ? item.quantity : 0;
  }

  updateSet(setNumber, setName, parts = null) {
    const index = this.currentData.sets.findIndex(set => set.number === setNumber);

    if (index >= 0) {
      this.currentData.sets[index].name = setName;
      if (parts) {
        this.currentData.sets[index].parts = parts;
      }
    } else {
      this.currentData.sets.push({
        number: setNumber,
        name: setName,
        parts: parts || []
      });
    }
  }

  updateSetPartQuantity(setNumber, partNum, colorId, quantityOwned) {
    const set = this.currentData.sets.find(s => s.number === setNumber);
    if (set) {
      const part = set.parts.find(p => p.part_num === partNum && p.color_id === colorId);
      if (part) {
        part.quantity_owned = Math.max(0, quantityOwned);
        this.invalidateAnalysisCache();
      }
    }
  }

  removeSet(setNumber) {
    this.currentData.sets = this.currentData.sets.filter(set => set.number !== setNumber);
  }

  async transferPartToSet(partNum, colorId, setNumber, quantity) {
    try {
      const inventoryItem = this.currentData.inventory.find(
        item => item.part_num === partNum && item.color_id === colorId
      );
      
      if (!inventoryItem || inventoryItem.quantity < quantity) {
        throw new Error('Quantité insuffisante dans l\'inventaire');
      }

      inventoryItem.quantity -= quantity;
      if (inventoryItem.quantity <= 0) {
        this.currentData.inventory = this.currentData.inventory.filter(
          item => !(item.part_num === partNum && item.color_id === colorId)
        );
      }

      const set = this.currentData.sets.find(s => s.number === setNumber);
      if (set) {
        const part = set.parts.find(p => p.part_num === partNum && p.color_id === colorId);
        if (part) {
          part.quantity_owned = Math.min(part.quantity, part.quantity_owned + quantity);
        }
      }

      this.invalidateAnalysisCache();
      await this.saveUnifiedData();
      return true;
      
    } catch (error) {
      console.error('Erreur transfert pièce vers set:', error);
      throw error;
    }
  }

  getPartCategory(partNum, colorName) {
    const item = this.currentData.inventory.find(
      item => item.part_num === partNum && item.color_name === colorName
    );
    return item ? item.category : 'Unknown';
  }

  async getColorIdByName(colorName) {
    try {
      if (window.legoDb) {
        const colors = await window.legoDb.getData('colors');
        const color = colors.find(c => c.name === colorName);
        if (color) {
          return color.id;
        }
        
        if (colorName && (colorName.toLowerCase().includes('noir') || colorName.toLowerCase().includes('black'))) {
          return 0;
        }
      }
      
      return 0;
    } catch (error) {
      console.error('Erreur récupération color_id:', error);
      return 0;
    }
  }

  exportData() {
    const blob = new Blob([JSON.stringify(this.currentData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lego_unified_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importData(jsonData) {
    try {
      const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      
      if (data.version === "2.0") {
        this.currentData = data;
      } else {
        this.currentData = await this.migrateFromLegacyData(data);
      }
      
      await this.saveUnifiedData();
      return true;
    } catch (error) {
      console.error('Erreur import données:', error);
      throw new Error('Format de fichier invalide');
    }
  }

  getStats() {
    return {
      inventoryCount: this.currentData.inventory.length,
      totalInventoryPieces: this.currentData.inventory.reduce((sum, item) => sum + item.quantity, 0),
      setsCount: this.currentData.sets.length,
      completedSets: this.currentData.sets.filter(set => 
        set.parts.every(part => part.quantity_owned >= part.quantity)
      ).length
    };
  }
}

// Système de gestion des événements sécurisé
class SecureButtonManager {
  constructor() {
    this.initialized = false;
  }

initialize() {
  if (this.initialized) return;
  
  debug('🚀 Initialisation SecureButtonManager');
  
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    debugGroup('🖱️ Clic bouton détecté');
    debug('🔹 Action:', button.dataset.action);
    debug('🔹 Part:', button.dataset.partNum);
    debug('🔹 Color ID:', button.dataset.colorId);
    debug('🔹 Bouton complet:', button);

    const action = button.dataset.action;
    const partNum = button.dataset.partNum;
    const partName = button.dataset.partName;
    const category = button.dataset.category;
    const colorId = button.dataset.colorId ? parseInt(button.dataset.colorId) : undefined;
    const colorName = button.dataset.colorName;
    const setNumber = button.dataset.setNumber;
    const partId = button.dataset.partId;
    const rowIndex = button.dataset.rowIndex ? parseInt(button.dataset.rowIndex) : undefined;

    switch (action) {
      case 'increment':
      case 'decrement':
        debug('➡️ Cas increment/decrement');
        if (setNumber && partId) {
          debug('  ↳ Contexte: Sets');
          this.handleSetQuantityChange(setNumber, partId, action === 'increment' ? 1 : -1);
        } else if (partNum && colorId !== undefined) {
          debug('  ↳ Contexte: Bulk Inventory');
          const delta = action === 'increment' ? 1 : -1;
          if (window.changeQuantity) {
            debug('  ↳ Appel de window.changeQuantity');
            window.changeQuantity(partNum, partName, category, colorId, colorName, delta);
          } else {
            console.error('❌ window.changeQuantity non disponible');
          }

        } else {
          console.warn('⚠️ Paramètres insuffisants pour l\'action');
        }
        break;

        // ✅ AJOUT : Gestion des actions minifig
  case 'minifig-increment':
  case 'minifig-decrement':
    debug('➡️ Cas minifig');
    if (partNum && colorId !== undefined) {
      const minifigId = button.dataset.minifigId;
      debug('  ↳ Appel de handleMinifigPartAction');
      if (window.handleMinifigPartAction) {
        window.handleMinifigPartAction(action, partNum, colorId, minifigId);
      } else {
        console.error('❌ handleMinifigPartAction non disponible');
      }
    }
    break;  

      case 'transfer-increment':
      case 'transfer-decrement':
        debug('➡️ Cas transfer');
        if (partNum && colorId !== undefined && setNumber && rowIndex !== undefined) {
          const transferDelta = action === 'transfer-increment' ? 1 : -1;
          if (window.transferToSetOptimized) {
            debug('  ↳ Appel de window.transferToSetOptimized');
            window.transferToSetOptimized(partNum, colorId, setNumber, transferDelta, rowIndex);
          } else {
            console.error('❌ window.transferToSetOptimized non disponible');
          }
        }
        break;

      case 'inventory-increment':
      case 'inventory-decrement':
        debug('➡️ Cas inventory');
        if (partNum && colorId !== undefined && rowIndex !== undefined) {
          const invDelta = action === 'inventory-increment' ? 1 : -1;
          if (window.changeInventoryQuantityOptimized) {
            debug('  ↳ Appel de window.changeInventoryQuantityOptimized');
            window.changeInventoryQuantityOptimized(partNum, colorId, invDelta, rowIndex);
          } else {
            console.error('❌ window.changeInventoryQuantityOptimized non disponible');
          }
        }
        break;
        
      default:
        console.warn('⚠️ Action non gérée:', action);
    }
    
    debugGroupEnd();
  });

  this.initialized = true;
  debug('✅ SecureButtonManager initialisé');
}

// AJOUTER cette nouvelle méthode :
updateButtonStates(partNum, colorId) {
  // Récupérer la quantité actuelle
  const currentQty = window.unifiedDataManager 
    ? window.unifiedDataManager.getInventoryQuantity(partNum, colorId)
    : 0;
  
  // Mettre à jour tous les boutons pour cette pièce/couleur
  const decrementButtons = document.querySelectorAll(
    `[data-action="decrement"][data-part-num="${this.escapeAttr(partNum)}"][data-color-id="${colorId}"]`
  );
  
  decrementButtons.forEach(btn => {
    btn.disabled = currentQty <= 0;
  });
  
  // Mettre à jour aussi l'affichage de la quantité
  const qtyElements = document.querySelectorAll(`#qty_${partNum}_${colorId}, #global_qty_${partNum}_${colorId}`);
  qtyElements.forEach(el => {
    if (el) el.textContent = currentQty;
  });
    this.initialized = true;
    debug('✓ SecureButtonManager initialisé');
  }

handleSetQuantityChange(setNumber, partId, delta) {
  if (window.setManager) {
    window.setManager.updatePartQuantity(setNumber, partId, delta);

    const set = window.setManager.getSet(setNumber);
    if (set) {
      const part = set.parts.find(p => p.id === partId);
      if (part) {
        // ✅ CORRECTION : Sélecteur plus robuste
        const allRows = document.querySelectorAll('.parts-table-row');
        let targetRow = null;
        
        allRows.forEach(row => {
          const checkbox = row.querySelector('.all-checkbox');
          if (checkbox && checkbox.dataset.partId === partId) {
            targetRow = row;
          }
        });

        if (targetRow) {
          const quantityDisplay = targetRow.querySelector('.quantity-display');
          if (quantityDisplay) {
            quantityDisplay.textContent = `${part.quantityOwned}/${part.quantity}`;
          }

          const decrementBtn = targetRow.querySelector('[data-action="decrement"]');
          const incrementBtn = targetRow.querySelector('[data-action="increment"]');
          const checkbox = targetRow.querySelector('.all-checkbox');

          if (decrementBtn) decrementBtn.disabled = part.quantityOwned <= 0;
          if (incrementBtn) incrementBtn.disabled = part.quantityOwned >= part.quantity;
          if (checkbox) checkbox.checked = part.quantityOwned >= part.quantity;

          const isCompleted = part.quantityOwned >= part.quantity;
          targetRow.className = `parts-table-row ${isCompleted ? 'completed' : ''}`;
        }
      }
    }

    // Recharger l'en-tête
    if (window.renderSetHeader) {
      window.renderSetHeader(setNumber);
    }
  }
}

  createButton(config) {
    const {
      action,
      partNum,
      partName,
      category,
      colorId,
      colorName,
      setNumber,
      partId,
      rowIndex,
      disabled = false,
      label = '+',
      className = 'btn btn-outline-secondary btn-sm'
    } = config;

    const attrs = [
      `data-action="${action}"`,
      partNum ? `data-part-num="${this.escapeAttr(partNum)}"` : '',
      partName ? `data-part-name="${this.escapeAttr(partName)}"` : '',
      category ? `data-category="${this.escapeAttr(category)}"` : '',
      colorId !== undefined ? `data-color-id="${colorId}"` : '',
      colorName ? `data-color-name="${this.escapeAttr(colorName)}"` : '',
      setNumber ? `data-set-number="${this.escapeAttr(setNumber)}"` : '',
      partId ? `data-part-id="${this.escapeAttr(partId)}"` : '',
      rowIndex !== undefined ? `data-row-index="${rowIndex}"` : '',
      disabled ? 'disabled' : ''
    ].filter(Boolean).join(' ');

    return `<button class="${className}" ${attrs}>${label}</button>`;
  }

escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')  // Échapper les backslashes d'abord
    .replace(/'/g, "\\'")     // Échapper les quotes simples pour JS
    .replace(/"/g, '&quot;')  // Échapper les quotes doubles pour HTML
    .replace(/\n/g, '\\n')    // Échapper les retours à la ligne
    .replace(/\r/g, '\\r')    // Échapper les retours chariot
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
}

// Créer une instance globale
window.secureButtonManager = new SecureButtonManager();
window.UnifiedDataManager = UnifiedDataManager;