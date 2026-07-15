const Groq = require('groq-sdk');
const { pool, pinecone, pineconeIndexName, getEmbedding } = require('../config/db');

const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

async function generateWithFallback(groq, contents) {
  let lastError;
  for (const model of modelsToTry) {
    try {
      const response = await groq.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: contents }],
      });
      const text = response?.choices?.[0]?.message?.content;
      if (text) return text;
    } catch (error) {
      lastError = error;
      console.warn(`[ragService] Model ${model} failed: ${error.message || error}. Trying fallback...`);
      continue;
    }
  }
  throw lastError || new Error("Failed to generate content: all models in the fallback list failed.");
}

/**
 * Service function to connect context lookup with Groq text generation.
 * Strict RAG only — every query is answered exclusively from retrieved
 * document context. No general-knowledge fallback, no query classification.
 *
 * @param {string} userQuery The raw query from the user.
 * @returns {Promise<string>} The generated response text.
 */
async function queryCompanyRAG(userQuery) {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) { throw new Error('GROQ_API_KEY is not defined in environment.'); }
  const groq = new Groq({ apiKey: groqApiKey });

  console.log(`[ragService] Routing query to RAG pipeline.`);
  const queryVector = await getEmbedding(userQuery);

  let matches = [];

  // Query Pinecone — shared corpus, no per-user filter
  if (process.env.PINECONE_API_KEY) {
    try {
      const index = pinecone.index(pineconeIndexName);

      const queryResponse = await index.query({
        vector: queryVector,
        topK: 5,
        includeMetadata: true
      });

      matches = queryResponse.matches.map(match => ({
        text: match.metadata ? match.metadata.text : '',
        similarity: match.score || 0
      }));
      console.log(`[ragService] Retrieved ${matches.length} matches from Pinecone.`);
    } catch (err) {
      console.error("[ragService] Pinecone query failed, falling back to local database search:", err);
    }
  }

  // Fallback to LocalVectorDB if Pinecone is not set up or query returned empty results
  if (matches.length === 0) {
    const { localVectorDBInstance } = require('../config/db');
    const localMatches = localVectorDBInstance.search(queryVector, 5);
    matches = localMatches.map(match => ({
      text: match.text,
      similarity: match.similarity
    }));
    console.log(`[ragService] Fallback: Retrieved ${matches.length} matches from local vector database.`);
  }

  // No documents uploaded / index empty — say so plainly, do not fall back
  // to the model's own knowledge.
  if (matches.length === 0) {
    return "I couldn't find any relevant information in the uploaded documents to answer that. Please check with an admin to make sure the relevant document has been uploaded, or try rephrasing your question.";
  }

  const context = matches.map(match => match.text).join('\n\n---\n\n');

  const prompt = `You are a document-grounded assistant. You must answer ONLY using the context below, which was retrieved from the company's uploaded documents. Do not use any outside knowledge, even if you know the answer.

Context from uploaded documents:
---
${context}
---

User Question: ${userQuery}

Instructions:
1. Answer using ONLY the information in the context above.
2. If the context does not contain enough information to answer the question, respond exactly with: "I couldn't find information about that in the uploaded documents." Do not guess, do not use general knowledge, do not fill gaps with outside information.
3. Do not mention that you were given "context" or "documents" as a technical concept — just answer naturally as if you know this from the company's records.`;

  return await generateWithFallback(groq, prompt);
}

module.exports = {
  queryCompanyRAG
};