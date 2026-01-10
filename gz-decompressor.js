// gz-decompressor.js - Décompression des fichiers .gz
class GzDecompressor {
  constructor() {
    this.pako = null;
  }

  async loadPako() {
    if (this.pako) return;
    
    // Charger la bibliothèque pako pour décompresser .gz
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js';
      script.onload = () => {
        this.pako = window.pako;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async downloadAndDecompress(url, onProgress = null) {
    await this.loadPako();
    
    console.log(`📥 Téléchargement de ${url}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    
    const contentLength = response.headers.get('content-length');
    const total = parseInt(contentLength, 10);
    let loaded = 0;
    
    const reader = response.body.getReader();
    const chunks = [];
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      loaded += value.length;
      
      if (onProgress && total) {
        onProgress({
          loaded,
          total,
          percentage: (loaded / total) * 100
        });
      }
    }
    
    // Fusionner tous les chunks
    const compressed = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, position);
      position += chunk.length;
    }
    
    console.log(`🔓 Décompression...`);
    
    // Décompresser avec pako
    const decompressed = this.pako.inflate(compressed);
    
    // Convertir en texte
    const decoder = new TextDecoder('utf-8');
    const csvText = decoder.decode(decompressed);
    
    console.log(`✅ Fichier décompressé: ${csvText.length} caractères`);
    
    return csvText;
  }
}

window.GzDecompressor = GzDecompressor;