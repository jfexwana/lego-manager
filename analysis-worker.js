// analysis-worker.js
// Optimiser avec des structures de données plus efficaces
self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  switch(type) {
    case 'analyzeRarity':
      // Utiliser des Map/Set au lieu de tableaux
      const partOccurrencesMap = new Map();
      
      data.allInventoryParts.forEach(ip => {
        const key = `${ip.part_num}_${ip.color_id}`;
        if (!partOccurrencesMap.has(key)) {
          partOccurrencesMap.set(key, new Set());
        }
        partOccurrencesMap.get(key).add(ip.inventory_id);
      });
      
      // Filtrer en une seule passe
      const rareParts = data.inventory
        .map(item => {
          const key = `${item.part_num}_${item.color_id}`;
          const sets = partOccurrencesMap.get(key);
          return sets && sets.size <= 5 ? {
            part_num: item.part_num,
            color_id: item.color_id,
            count: sets.size
          } : null;
        })
        .filter(Boolean);
      
      self.postMessage({ type: 'rarityComplete', result: rareParts });
      break;
  }
};

async function analyzeInventoryForRarity({ inventory, allInventoryParts, allParts }) {
  const rareParts = [];
  const partRarityMap = new Map();
  
  // Grouper par part_num pour compter les occurrences
  const partOccurrences = new Map();
  allInventoryParts.forEach(ip => {
    const key = `${ip.part_num}_${ip.color_id}`;
    if (!partOccurrences.has(key)) {
      partOccurrences.set(key, new Set());
    }
    partOccurrences.get(key).add(ip.inventory_id);
  });
  
  // Identifier les pièces rares (présentes dans ≤5 inventories)
  for (const item of inventory) {
    const key = `${item.part_num}_${item.color_id}`;
    const inventorySets = partOccurrences.get(key);
    
    if (inventorySets && inventorySets.size <= 5) {
      rareParts.push({
        part_num: item.part_num,
        color_id: item.color_id,
        inventories: Array.from(inventorySets)
      });
    }
  }
  
  return rareParts;
}

async function findPossibleSetsFromParts({ inventory, allInventoryParts, inventoriesMap }) {
  const ownedParts = new Map();
  inventory.forEach(item => {
    ownedParts.set(`${item.part_num}_${item.color_id}`, item.quantity);
  });
  
  // Grouper les pièces par inventory_id
  const inventoryContents = new Map();
  allInventoryParts.forEach(ip => {
    if (!inventoryContents.has(ip.inventory_id)) {
      inventoryContents.set(ip.inventory_id, []);
    }
    inventoryContents.get(ip.inventory_id).push({
      part_num: ip.part_num,
      color_id: ip.color_id
    });
  });
  
  const possibleSets = [];
  
  for (const [inventoryId, parts] of inventoryContents.entries()) {
    let matchCount = 0;
    let totalParts = parts.length;
    
    for (const part of parts) {
      const key = `${part.part_num}_${part.color_id}`;
      if (ownedParts.has(key) && ownedParts.get(key) > 0) {
        matchCount++;
      }
    }
    
    const matchPercentage = (matchCount / totalParts) * 100;
    
    // Seuils selon la taille du set
    let threshold = 30;
    if (totalParts <= 20) threshold = 70;
    else if (totalParts <= 50) threshold = 60;
    else if (totalParts <= 100) threshold = 50;
    else if (totalParts <= 200) threshold = 40;
    
    if (matchPercentage >= threshold) {
      const setNum = inventoriesMap.get(inventoryId);
      if (setNum) {
        possibleSets.push({
          inventory_id: inventoryId,
          set_num: setNum,
          matchCount,
          totalParts,
          matchPercentage
        });
      }
    }
  }
  
  return possibleSets.sort((a, b) => b.matchPercentage - a.matchPercentage);
}