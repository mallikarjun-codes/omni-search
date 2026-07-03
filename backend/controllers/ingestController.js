const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { localVectorDBInstance } = require('../config/db');

/**
 * Reads a target plain text corporate document, chunks the text by paragraphs or double newlines,
 * generates text embeddings using the 'text-embedding-004' model (with gemini-embedding-001 fallback),
 * and pushes the resulting data into your 'LocalVectorDB' instance.
 *
 * @param {string} filePath Absolute or relative path to the plain text document
 * @param {string} documentId Identifier prefix for the ingested chunks
 * @returns {Promise<number>} Number of chunks ingested
 */
async function ingestDocument(filePath, documentId = 'corporate_doc') {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Target corporate document not found at: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Chunk the text by paragraphs or double newlines
  const chunks = content
    .split(/\r?\n\s*\r?\n/)
    .map(c => c.trim())
    .filter(Boolean);

  console.log(`[IngestController] Read "${filePath}". Found ${chunks.length} chunks.`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined.");
  }

  const ai = new GoogleGenAI({ apiKey });

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    let vector;

    try {
      // 1. Attempt to generate text embeddings using 'text-embedding-004' via 'ai.models.embedContent'
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: chunkText,
      });

      if (response.embeddings && response.embeddings[0]) {
        vector = response.embeddings[0].values;
      } else if (response.embedding) {
        vector = response.embedding.values;
      }
    } catch (error) {
      // 2. Fallback to 'gemini-embedding-001' if 'text-embedding-004' is not found/supported
      if (error.status === 404 || error.message.includes('not found') || error.message.includes('404')) {
        console.warn(`[IngestController] 'text-embedding-004' not found or supported. Falling back to 'gemini-embedding-001'.`);
        const fallbackResponse = await ai.models.embedContent({
          model: 'gemini-embedding-001',
          contents: chunkText,
        });

        if (fallbackResponse.embeddings && fallbackResponse.embeddings[0]) {
          vector = fallbackResponse.embeddings[0].values;
        } else if (fallbackResponse.embedding) {
          vector = fallbackResponse.embedding.values;
        }
      } else {
        throw error;
      }
    }

    if (!vector) {
      throw new Error(`[IngestController] Failed to generate embedding for chunk ${i}`);
    }

    // 3. Push the resulting data into your 'LocalVectorDB' instance
    const chunkId = `${documentId}_chunk_${i}`;
    localVectorDBInstance.addRecord(chunkId, chunkText, vector);
    console.log(`[IngestController] Ingested chunk ${i} (ID: ${chunkId}, Vector Dimension: ${vector.length})`);
  }

  return chunks.length;
}

module.exports = {
  ingestDocument,
};
