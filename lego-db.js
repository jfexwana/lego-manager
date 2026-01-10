// lego-db.js - Fonctions mutualisées pour la gestion de la base de données LEGO

// Variables globales partagées
const API_KEY = "2c97f9a3767a101591cd086050a71279";
const BASE_URL = "https://rebrickable.com/api/v3/lego/";

// Configuration des fichiers requis
const REQUIRED_FILES = {
  parts: {
    name: 'parts.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/parts.csv.gz',
    description: 'Pièces LEGO (~60 Mo)'
  },
  part_categories: {
    name: 'part_categories.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/part_categories.csv.gz',
    description: 'Catégories de pièces (~1 Ko)'
  },
  colors: {
    name: 'colors.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/colors.csv.gz',
    description: 'Couleurs LEGO (~10 Ko)'
  },
  sets: {
    name: 'sets.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/sets.csv.gz',
    description: 'Informations des sets (~15 Mo)'
  },
  inventories: {  // NOUVEAU
    name: 'inventories.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/inventories.csv.gz',
    description: 'Correspondance inventory_id → set_num (~5 Mo)'
  },
  inventory_parts: {
    name: 'inventory_parts.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/inventory_parts.csv.gz',
    description: 'Contenu des inventaires (~250 Mo)'
  },
  minifigs: {  // NOUVEAU
    name: 'minifigs.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/minifigs.csv.gz',
    description: 'Informations des minifigures (~2 Mo)'
  },
  inventory_minifigs: {  // NOUVEAU
    name: 'inventory_minifigs.csv',
    url: 'https://cdn.rebrickable.com/media/downloads/inventory_minifigs.csv.gz',
    description: 'Minifigs dans les inventaires (~1 Mo)'
  }
};

// Cache d'images
const imageCache = new Map();

// AJOUTER en début de fichier, après les constantes :
function safeParseJSON(jsonString, fallback = null) {
  try {
    return jsonString ? JSON.parse(jsonString) : fallback;
  } catch (error) {
    console.error('Erreur parsing JSON:', error);
    return fallback;
  }
}

function safeGetLocalStorage(key, fallback = null) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (error) {
    console.error('Erreur localStorage:', error);
    return fallback;
  }
}

// Classe pour gérer IndexedDB
class LegoDatabase {
  constructor() {
    this.dbName = 'LegoPartsDB';
    this.version = 8;
    this.db = null;
  }

  async initializeComplete() {
  await this.init();
  await this.verifyAndRepairStores();
  debug('✅ Database complètement initialisée');
}

async verifyAndRepairStores() {
  const requiredStores = ["parts", "part_categories", "inventory_parts", "colors", "sets", "inventories", "minifigs", "inventory_minifigs", "metadata"];
    try {
    const existingStores = Array.from(this.db.objectStoreNames);
    const missingStores = requiredStores.filter(s => !existingStores.includes(s));
    
    if (missingStores.length > 0) {
      console.warn("Stores manquants dans IndexedDB:", missingStores);
      
      // Fermer la connexion actuelle
      this.db.close();
      
      // Réouvrir avec une version supérieure pour créer les stores manquants
      return new Promise((resolve, reject) => {
        const newVersion = this.version + 1;
        const request = indexedDB.open(this.dbName, newVersion);
        
        request.onerror = () => reject(request.error);
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          console.log("Création des stores IndexedDB...");
          
          for (const storeName of missingStores) {
            if (!db.objectStoreNames.contains(storeName)) {
              console.log("Création du store:", storeName);
              
              switch(storeName) {
                case 'parts':
                  const partsStore = db.createObjectStore('parts', { keyPath: 'part_num' });
                  partsStore.createIndex('part_cat_id', 'part_cat_id', { unique: false });
                  partsStore.createIndex('name', 'name', { unique: false });
                  break;
                  
                case 'part_categories':
                  const categoriesStore = db.createObjectStore('part_categories', { keyPath: 'id' });
                  categoriesStore.createIndex('name', 'name', { unique: false });
                  break;
                  
                case 'inventory_parts':
                  const inventoryStore = db.createObjectStore('inventory_parts', { keyPath: 'id', autoIncrement: true });
                  inventoryStore.createIndex('part_num', 'part_num', { unique: false });
                  inventoryStore.createIndex('color_id', 'color_id', { unique: false });
                  inventoryStore.createIndex('inventory_id', 'inventory_id', { unique: false }); // AJOUTEZ CETTE LIGNE
                  break;
                  
                case 'colors':
                  const colorsStore = db.createObjectStore('colors', { keyPath: 'id' });
                  colorsStore.createIndex('name', 'name', { unique: false });
                  break;

                case 'sets':
                  const setsStore = db.createObjectStore('sets', { keyPath: 'set_num' });
                  setsStore.createIndex('name', 'name', { unique: false });
                  setsStore.createIndex('year', 'year', { unique: false });
                  setsStore.createIndex('theme_id', 'theme_id', { unique: false });
                  break;
                
                case 'inventories':
                  const inventoriesStore = db.createObjectStore('inventories', { keyPath: 'id' });
                  inventoriesStore.createIndex('set_num', 'set_num', { unique: false });
                  break;

                case 'minifigs':
                  const minifigsStore = db.createObjectStore('minifigs', { keyPath: 'fig_num' });
                  minifigsStore.createIndex('name', 'name', { unique: false });
                  break;

                case 'inventory_minifigs':
                  const invMinifigsStore = db.createObjectStore('inventory_minifigs', { keyPath: 'id', autoIncrement: true  });
                  invMinifigsStore.createIndex('inventory_id', 'inventory_id', { unique: false });
                  invMinifigsStore.createIndex('fig_num', 'fig_num', { unique: false });
                  break;
                  
                case 'metadata':
                  db.createObjectStore('metadata', { keyPath: 'key' });
                  break;
              }
            }
          }
        };
        
        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.version = newVersion;
          console.log("Stores manquants créés avec succès");
          resolve(this.db);
        };
      });
    } else {
      console.log("Tous les stores nécessaires sont présents 👍");
      return this.db;
    }
  } catch (err) {
    console.error("Erreur vérification stores:", err);
    throw err;
  }
}

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('Erreur IndexedDB:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialisée avec succès');
        resolve(this.db);
      };

request.onupgradeneeded = (event) => {
  const db = event.target.result;
  console.log('Création/mise à jour des stores IndexedDB...');

  // Liste complète des stores à créer
  const stores = {
    'parts': () => {
      if (!db.objectStoreNames.contains('parts')) {
        const partsStore = db.createObjectStore('parts', { keyPath: 'part_num' });
        partsStore.createIndex('part_cat_id', 'part_cat_id', { unique: false });
        partsStore.createIndex('name', 'name', { unique: false });
      }
    },
    'part_categories': () => {
      if (!db.objectStoreNames.contains('part_categories')) {
        const categoriesStore = db.createObjectStore('part_categories', { keyPath: 'id' });
        categoriesStore.createIndex('name', 'name', { unique: false });
      }
    },
    'inventory_parts': () => {
      if (!db.objectStoreNames.contains('inventory_parts')) {
        const inventoryStore = db.createObjectStore('inventory_parts', { keyPath: 'id', autoIncrement: true });
        inventoryStore.createIndex('part_num', 'part_num', { unique: false });
        inventoryStore.createIndex('color_id', 'color_id', { unique: false });
        inventoryStore.createIndex('inventory_id', 'inventory_id', { unique: false });
      }
    },
    'colors': () => {
      if (!db.objectStoreNames.contains('colors')) {
        const colorsStore = db.createObjectStore('colors', { keyPath: 'id' });
        colorsStore.createIndex('name', 'name', { unique: false });
      }
    },
    'sets': () => {
      if (!db.objectStoreNames.contains('sets')) {
        const setsStore = db.createObjectStore('sets', { keyPath: 'set_num' });
        setsStore.createIndex('name', 'name', { unique: false });
        setsStore.createIndex('year', 'year', { unique: false });
        setsStore.createIndex('theme_id', 'theme_id', { unique: false });
      }
    },
    'inventories': () => {
      if (!db.objectStoreNames.contains('inventories')) {
        const inventoriesStore = db.createObjectStore('inventories', { keyPath: 'id' });
        inventoriesStore.createIndex('set_num', 'set_num', { unique: false });
      }
    },
    'minifigs': () => {
      if (!db.objectStoreNames.contains('minifigs')) {
        const minifigsStore = db.createObjectStore('minifigs', { keyPath: 'fig_num' });
        minifigsStore.createIndex('name', 'name', { unique: false });
      }
    },
    'inventory_minifigs': () => {
      if (!db.objectStoreNames.contains('inventory_minifigs')) {
        const invMinifigsStore = db.createObjectStore('inventory_minifigs', { keyPath: 'id', autoIncrement: true });
        invMinifigsStore.createIndex('inventory_id', 'inventory_id', { unique: false });
        invMinifigsStore.createIndex('fig_num', 'fig_num', { unique: false });
      }
    },
    'metadata': () => {
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    }
  };

  // Créer tous les stores
  Object.keys(stores).forEach(storeName => {
    stores[storeName]();
  });
};
    });
  }
  async getData(tableName) {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([tableName], 'readonly');
        const store = transaction.objectStore(tableName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getDataByIndex(tableName, indexName, value) {
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([tableName], 'readonly');
        const store = transaction.objectStore(tableName);
        const index = store.index(indexName);
        const request = index.getAll(value);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

async getPartByNum(partNum) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = this.db.transaction(['parts'], 'readonly');
      const store = transaction.objectStore('parts');
      const request = store.get(partNum);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

async getSetByNum(setNum) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = this.db.transaction(['sets'], 'readonly');
      const store = transaction.objectStore('sets');
      const request = store.get(setNum);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

// Récupérer les minifigs présentes dans un set
async getMinifigsInSet(setNum) {
  try {
    // 1. Récupérer l'inventory_id du set
    const inventories = await this.getDataByIndex('inventories', 'set_num', setNum);
    if (!inventories || inventories.length === 0) {
      console.log(`Aucun inventaire trouvé pour le set ${setNum}`);
      return [];
    }
    
    const inventoryId = inventories[0].id;
    
    // 2. Récupérer les minifigs de cet inventaire
    const invMinifigs = await this.getDataByIndex('inventory_minifigs', 'inventory_id', inventoryId);
    if (!invMinifigs || invMinifigs.length === 0) {
      return [];
    }
    
    // 3. Enrichir avec les détails des minifigs
    const minifigsDetails = await Promise.all(
      invMinifigs.map(async (im) => {
        const minifig = await this.getMinifigByNum(im.fig_num);
        return {
          fig_num: im.fig_num,
          name: minifig?.name || 'Minifig inconnue',
          quantity: im.quantity,
          img_url: minifig?.img_url || '',
          num_parts: minifig?.num_parts || 0
        };
      })
    );
    
    return minifigsDetails.filter(m => m !== null);
  } catch (error) {
    console.error(`Erreur récupération minifigs pour set ${setNum}:`, error);
    return [];
  }
}

// Méthode helper pour récupérer une minifig par son numéro
async getMinifigByNum(figNum) {
  return new Promise((resolve, reject) => {
    try {
      const transaction = this.db.transaction(['minifigs'], 'readonly');
      const store = transaction.objectStore('minifigs');
      const request = store.get(figNum);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
}

// Récupérer les pièces d'une minifig
async getMinifigParts(figNum) {
  try {
    // 1. Trouver l'inventory de cette minifig
    const inventories = await this.getDataByIndex('inventories', 'set_num', figNum);
    if (!inventories || inventories.length === 0) {
      return [];
    }
    
    const minifigInventoryId = inventories[0].id;
    
    // 2. Récupérer les pièces de cet inventory
    const invParts = await this.getDataByIndex('inventory_parts', 'inventory_id', minifigInventoryId);
    
    // 3. Enrichir avec noms et couleurs
    const [partsData, colorsData] = await Promise.all([
      this.getData('parts'),
      this.getData('colors')
    ]);
    
    const partsMap = new Map(partsData.map(p => [p.part_num, p]));
    const colorsMap = new Map(colorsData.map(c => [c.id, c]));
    
    return invParts.map(ip => {
      const part = partsMap.get(ip.part_num);
      const color = colorsMap.get(ip.color_id);
      
      return {
        part_num: ip.part_num,
        name: part ? part.name : 'Pièce inconnue',
        color_id: ip.color_id,
        color_name: color ? color.name : 'Couleur inconnue',
        quantity: ip.quantity || 1,
        img_url: ip.img_url || ''
      };
    });
  } catch (error) {
    console.error(`Erreur récupération pièces minifig ${figNum}:`, error);
    return [];
  }
}

// Récupérer les informations complètes d'un set (nom, image, nombre de pièces)
async getSetInfo(setNum) {
  const setData = await this.getSetByNum(setNum);
  if (setData) {
    return {
      number: setData.set_num,
      name: setData.name,
      year: setData.year,
      num_parts: setData.num_parts,
      img_url: setData.img_url
    };
  }
  return null;
}

// Récupérer plusieurs sets en une fois
async getMultipleSetsInfo(setNumbers) {
  const results = await Promise.all(
    setNumbers.map(setNum => this.getSetInfo(setNum))
  );
  return results.filter(set => set !== null);
}


  async saveData(tableName, data, onProgress = null) {
    try {
      //let cleanedData = data;
     // if (tableName === "parts") cleanedData = cleanPartsData(data);
     // if (tableName === "inventory_parts") cleanedData = cleanInventoryPartsData(data);
     // if (tableName === "part_categories") cleanedData = cleanCategoriesData(data);
     // if (tableName === "colors") cleanedData = cleanColorsData(data);

      const cleanedData = data;
      const transaction = this.db.transaction([tableName], 'readwrite');
      const store = transaction.objectStore(tableName);
      await store.clear();

      let processed = 0;
      const chunkSize = 1000;

      if (tableName === "inventory_parts") {
        const partSetCounts = new Map();
        const categorySetCounts = new Map();
        
        for (const item of cleanedData) {
          if (!partSetCounts.has(item.part_num)) {
            partSetCounts.set(item.part_num, new Set());
          }
          partSetCounts.get(item.part_num).add(item.inventory_id);
        }
        
        for (const [partNum, inventoryIds] of partSetCounts) {
          await this.saveMetadata(`part_${partNum}_set_count`, inventoryIds.size);
        }
        
        try {
          const partsData = await this.getData('parts');
          const partToCategoryMap = new Map();
          partsData.forEach(part => {
            partToCategoryMap.set(part.part_num, part.part_cat_id);
          });
          
          for (const [partNum, inventoryIds] of partSetCounts) {
            const categoryId = partToCategoryMap.get(partNum);
            if (categoryId) {
              if (!categorySetCounts.has(categoryId)) {
                categorySetCounts.set(categoryId, new Set());
              }
              inventoryIds.forEach(id => categorySetCounts.get(categoryId).add(id));
            }
          }
          
          for (const [categoryId, inventoryIds] of categorySetCounts) {
            await this.saveMetadata(`category_${categoryId}_set_count`, inventoryIds.size);
          }
        } catch (error) {
          console.warn('Impossible de calculer les statistiques par catégorie:', error);
        }
      }

      for (let i = 0; i < cleanedData.length; i += chunkSize) {
        const chunk = cleanedData.slice(i, i + chunkSize);
        
        await new Promise((resolve, reject) => {
          const batchTransaction = this.db.transaction([tableName], 'readwrite');
          const batchStore = batchTransaction.objectStore(tableName);
          
          for (const item of chunk) {
            batchStore.add(item);
          }
          
          batchTransaction.oncomplete = () => {
            processed += chunk.length;
            if (onProgress && i % (chunkSize * 5) === 0) {
              onProgress(processed, cleanedData.length);
            }
            resolve();
          };
          
          batchTransaction.onerror = () => reject(batchTransaction.error);
        });
      }

      await this.saveMetadata(`${tableName}_last_update`, Date.now());
      await this.saveMetadata(`${tableName}_count`, cleanedData.length);

      if (tableName === "parts") {
        const counts = {};
        for (const item of cleanedData) {
          const catId = item.part_cat_id;
          counts[catId] = (counts[catId] || 0) + 1;
        }
        for (const [catId, count] of Object.entries(counts)) {
          await this.saveMetadata(`category_${catId}_count`, count);
        }
      }

    } catch (error) {
      console.error(`Erreur saveData pour ${tableName}:`, error);
      throw error;
    }
  }

  async setFileDate(tableName, date) {
    await this.saveMetadata(`${tableName}_file_date`, date);
  }

  async getMetadata(key) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction("metadata", "readonly");
        const store = tx.objectStore("metadata");
        const req = store.get(key);

        req.onsuccess = () => {
          if (req.result) {
            resolve(req.result.value ?? req.result);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      } catch (err) {
        console.error("Erreur getMetadata:", err);
        reject(err);
      }
    });
  }

  async getFileDate(tableName) {
    return await this.getMetadata(`${tableName}_file_date`);
  }

  async deleteAllData() {
    const transaction = this.db.transaction([...Object.keys(REQUIRED_FILES), 'metadata'], 'readwrite');
    const promises = [];
    
    Object.keys(REQUIRED_FILES).forEach(tableName => {
      promises.push(transaction.objectStore(tableName).clear());
    });
    promises.push(transaction.objectStore('metadata').clear());
    
    await Promise.all(promises);
  }

  async getTableCount(tableName) {
    return await this.getMetadata(`${tableName}_count`) || 0;
  }

  async saveMetadata(key, value) {
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction("metadata", "readwrite");
        const store = tx.objectStore("metadata");
        store.put({ key, value });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        console.error("Erreur saveMetadata:", err);
        reject(err);
      }
    });
  }
}

// Fonctions de nettoyage des données
function cleanPartsData(data) {
  return data.map(row => ({
    part_num: row.part_num,
    name: row.name,
    part_cat_id: parseInt(row.part_cat_id, 10) || 0
  }));
}

function cleanInventoryPartsData(data) {
  return data
    .map(row => {
      // ✅ CORRECTION : Conversion robuste de is_spare
      let isSpare = false;
      const spareValue = String(row.is_spare || '').toLowerCase().trim();
      
      if (spareValue === 't' || 
          spareValue === 'true' || 
          spareValue === '1' || 
          spareValue === 'yes') {
        isSpare = true;
      }
      
      return {
        part_num: row.part_num,
        color_id: parseInt(row.color_id, 10) || 0,
        img_url: row.img_url || '',
        inventory_id: parseInt(row.inventory_id, 10) || row.inventory_id,
        is_spare: isSpare,  // ✅ Toujours un booléen pur
        quantity: parseInt(row.quantity, 10) || 1
      };
    });
}

function cleanCategoriesData(data) {
  return data.map(row => ({
    id: parseInt(row.id, 10),
    name: row.name
  }));
}

function cleanColorsData(data) {
  return data.map(row => ({
    id: parseInt(row.id, 10),
    name: row.name
  }));
}

function cleanSetsData(data) {
  return data.map(row => ({
    set_num: row.set_num,
    name: row.name,
    year: parseInt(row.year, 10) || 0,
    theme_id: parseInt(row.theme_id, 10) || 0,
    num_parts: parseInt(row.num_parts, 10) || 0,
    img_url: row.img_url
  }));
}

function cleanInventoriesData(data) {
  return data.map(row => ({
    id: parseInt(row.id, 10) || 0,
    version: parseInt(row.version, 10) || 1,
    set_num: row.set_num
  }));
}

function cleanMinifigsData(data) {
  return data.map(row => ({
    fig_num: row.fig_num,
    name: row.name,
    num_parts: parseInt(row.num_parts, 10) || 0,
    img_url: row.img_url || ''
  }));
}

function cleanInventoryMinifigsData(data) {
  return data.map(row => ({
    inventory_id: row.inventory_id,
    fig_num: row.fig_num,
    quantity: parseInt(row.quantity, 10) || 1
  }));
}


// Fonctions utilitaires pour les images
function getErrorImageDataUrl() {
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjVGNUY1Ii8+CjxyZWN0IHg9IjEiIHk9IjEiIHdpZHRoPSI5OCIgaGVpZ2h0PSI5OCIgc3Ryb2tlPSIjREREIi8+Cjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5FcnJldXI8L3RleHQ+Cjwvc3ZnPgo=';
}

function checkImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
    setTimeout(() => resolve(false), 5000);
  });
}

// Fonctions de recherche avancée
function performAdvancedSearch(parts, query) {
  const tokens = parseSearchQuery(query);
  
  return parts.filter(part => {
    const searchText = ((part.name || '') + ' ' + (part.part_num || '')).toLowerCase();
    return evaluateSearchTokens(searchText, tokens);
  });
}

function parseSearchQuery(query) {
  const tokens = [];
  const regex = /(NOT\s+)?"([^"]+)"|(\w+)/gi;
  let match;
  let operator = 'AND';
  
  while ((match = regex.exec(query)) !== null) {
    const isNot = match[1] !== undefined;
    const term = match[2] || match[3];
    
    if (['AND', 'OR'].includes(term.toUpperCase())) {
      operator = term.toUpperCase();
      continue;
    }
    
    tokens.push({
      term: term.toLowerCase(),
      operator: operator,
      negative: isNot
    });
  }
  
  return tokens;
}

function evaluateSearchTokens(searchText, tokens) {
  if (tokens.length === 0) return true;
  
  let result = true;
  let currentOperator = 'AND';
  
  for (const token of tokens) {
    const matches = searchText.includes(token.term);
    const tokenResult = token.negative ? !matches : matches;
    
    if (currentOperator === 'AND') {
      result = result && tokenResult;
    } else if (currentOperator === 'OR') {
      result = result || tokenResult;
    }
    
    currentOperator = token.operator;
  }
  
  return result;
}

// Fonctions utilitaires
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Fonction pour obtenir le nom de la couleur par son ID
async function getColorNameById(colorId) {
  try {
    if (colorId === 0) return 'Noir';
    const colors = await db.getData('colors');
    const color = colors.find(c => c.id === colorId);
    return color ? color.name : 'Couleur inconnue';
  } catch (error) {
    console.error('Erreur récupération nom couleur:', error);
    return 'Couleur inconnue';
  }
}

// Fonctions de messages
function showSuccessMessage(message, parentElement = document.body) {
  showMessage(message, 'success', parentElement);
}

function showErrorMessage(message, parentElement = document.body) {
  showMessage(message, 'error', parentElement);
}

function showInfoMessage(message, parentElement = document.body) {
  showMessage(message, 'info', parentElement);
}

function showMessage(message, type, parentElement) {
  const oldMessages = document.querySelectorAll('.temp-message');
  oldMessages.forEach(msg => msg.remove());
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `temp-message ${type === 'success' ? 'success' : type === 'error' ? 'error' : 'update-section'}`;
  messageDiv.innerHTML = `<p>${message}</p>`;
  
  parentElement.insertBefore(messageDiv, parentElement.firstChild);
  
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.remove();
    }
  }, 10000);
}

// Fonction pour créer un Worker CSV inline
function createCSVWorker() {
  const workerCode = `
    self.onmessage = function (e) {
      const { text } = e.data;
      const result = parseCSV(text);
      postMessage({ type: "done", data: result });
    };

    function parseCSV(csvText) {
      const lines = csvText.split('\\n').filter(line => line.trim());
      if (lines.length === 0) return [];

      const headers = parseCSVLine(lines[0]);
      const data = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
          const row = {};
          headers.forEach((header, index) => {
            let value = values[index];
            if (value && !isNaN(value) && value !== '' &&
                !header.includes('part_num') &&
                !header.includes('inventory_id')) {
              value = parseFloat(value);
            }
            row[header] = value;
          });
          data.push(row);
        }
        if (i % 50000 === 0) {
          postMessage({ type: "progress", value: i / lines.length });
        }
      }
      return data;
    }

    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    }
  `;
  
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

// Export des fonctions et classes pour utilisation dans d'autres fichiers
    window.LegoDatabase = LegoDatabase;
    window.REQUIRED_FILES = REQUIRED_FILES;
    window.cleanPartsData = cleanPartsData;
    window.cleanInventoryPartsData = cleanInventoryPartsData;
    window.cleanCategoriesData = cleanCategoriesData;
    window.cleanColorsData = cleanColorsData;
    window.cleanSetsData = cleanSetsData;
    window.performAdvancedSearch = performAdvancedSearch;
    window.debounce = debounce;
    window.showSuccessMessage = showSuccessMessage;
    window.showErrorMessage = showErrorMessage;
    window.showInfoMessage = showInfoMessage;
    window.createCSVWorker = createCSVWorker;

    // Gestionnaire d'inventaire personnel mis à jour pour utiliser le format unifié
class PersonalInventoryV2 {
  constructor(unifiedManager) {
    this.unifiedManager = unifiedManager;
  }

  setPart(partNum, partName, categoryName, colorId, colorName, quantity) {
    this.unifiedManager.updateInventory(partNum, colorId, colorName, quantity, categoryName);
  }

getQuantity(partNum, colorId) {
  const item = this.unifiedManager.currentData.inventory.find(
    item => item.part_num === partNum && item.color_id === colorId
  );
  return item ? item.quantity : 0;
}

  getAll() {
    return this.unifiedManager.currentData.inventory;
  }

  // Sauvegarder automatiquement via le gestionnaire unifié
  save() {
    return this.unifiedManager.saveUnifiedData();
  }

  // Export vers fichier JSON local
  exportToJSON() {
    this.unifiedManager.exportData();
  }
}

// Exporter la nouvelle classe
window.PersonalInventoryV2 = PersonalInventoryV2;
window.cleanInventoriesData = cleanInventoriesData;
window.cleanMinifigsData = cleanMinifigsData;
window.cleanInventoryMinifigsData = cleanInventoryMinifigsData;
window.safeParseJSON = safeParseJSON;
window.safeGetLocalStorage = safeGetLocalStorage;
window.LegoDatabase.prototype.getMinifigsInSet = LegoDatabase.prototype.getMinifigsInSet;
window.LegoDatabase.prototype.getMinifigByNum = LegoDatabase.prototype.getMinifigByNum;
window.LegoDatabase.prototype.getMinifigParts = LegoDatabase.prototype.getMinifigParts;