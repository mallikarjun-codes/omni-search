const { GoogleGenAI } = require('@google/genai');
const { localVectorDBInstance, getEmbedding } = require('../config/db');

/**
 * Service function to connect context lookup with Gemini text generation.
 * 
 * @param {string} userQuery The raw query from the user.
 * @returns {Promise<string>} The generated response text.
 */
async function queryCompanyRAG(userQuery) {
  // 1. Generate query embedding using the existing getEmbedding utility
  const queryVector = await getEmbedding(userQuery);

  // 2. Retrieve top 3 matching text chunks from the LocalVectorDB singleton instance
  const matches = localVectorDBInstance.search(queryVector, 3);

  // 3. Extract text from retrieved chunks and separate by newlines
  const context = matches.map(match => match.text).join('\n');

  // 4. Construct the strict prompt payload
  const prompt = `You are an authorized, secure corporate AI assistant. Answer the user's question safely, professionally, and accurately using ONLY the facts provided in the Context section below. 

Context:
${context}

User Question: ${userQuery}

Constraint: If the answer cannot be confidently derived from the provided context, you must strictly reply with: 'I am sorry, but I do not have access to that information in the official company documents.'`;

  // 5. Initialize the modern GoogleGenAI client and request generation
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment.');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Fallback chain for LLM generation to support different environment capabilities
  const modelsToTry = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-3.5-flash'];
  let response;
  let lastError;

  for (const model of modelsToTry) {
    try {
      response = await ai.models.generateContent({
        model: model,
        contents: prompt,
      });
      if (response && response.text) {
        break; // Successfully generated content
      }
    } catch (error) {
      lastError = error;
      console.warn(`[ragService] Model ${model} failed: ${error.message || error}. Trying fallback...`);
      continue;
    }
  }

  if (!response) {
    throw lastError || new Error("Failed to generate content: all models in the fallback list failed.");
  }

  return response.text;
}

module.exports = {
  queryCompanyRAG
};
