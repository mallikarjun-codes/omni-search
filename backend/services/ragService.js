const { GoogleGenAI } = require('@google/genai');
const { pool, pinecone, pineconeIndexName, getEmbedding } = require('../config/db');

const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-3.5-flash'];

async function generateWithFallback(ai, contents) {
  let lastError;
  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
      });
      if (response && response.text) {
        return response.text;
      }
    } catch (error) {
      lastError = error;
      console.warn(`[ragService] Model ${model} failed: ${error.message || error}. Trying fallback...`);
      continue;
    }
  }
  throw lastError || new Error("Failed to generate content: all models in the fallback list failed.");
}

/**
 * Service function to connect context lookup with Gemini text generation.
 * 
 * @param {string} userQuery The raw query from the user.
 * @param {string} currentUserId The authenticated ID of the user query.
 * @returns {Promise<string>} The generated response text.
 */
async function queryCompanyRAG(userQuery, currentUserId = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment.');
  }

  const ai = new GoogleGenAI({ apiKey });

  // 1. Evaluate user query intent
  let isConversational = false;
  try {
    const classificationPrompt = `Analyze the following user query and classify it as either "GENERAL" (greetings, conversational chit-chat, general programming help, math, writing code, or generic assistance) or "RAG" (inquiring about company documents, policies, employee benefits, IT security guidelines, device protocols, business travel rules, expense reimbursement, or specific custom files).

User Query: "${userQuery}"

Respond with ONLY the word "GENERAL" or "RAG".`;

    const classificationResult = await generateWithFallback(ai, classificationPrompt);
    const result = classificationResult ? classificationResult.trim().toUpperCase() : '';
    console.log(`[ragService] Query classified as: ${result}`);
    if (result.includes('GENERAL')) {
      isConversational = true;
    }
  } catch (err) {
    console.warn(`[ragService] Classification failed, assuming RAG for safety. Error: ${err.message}`);
  }

  // 2. Direct baseline completion if conversational/general
  if (isConversational) {
    console.log(`[ragService] Routing query to baseline (GENERAL intent).`);
    const baselineResponse = await generateWithFallback(ai, userQuery);
    return baselineResponse;
  }

  // 3. Otherwise, RAG intent requires semantic search query context injection
  console.log(`[ragService] Routing query to RAG pipeline (RAG intent).`);
  const queryVector = await getEmbedding(userQuery);

  let matches = [];

  // Query Pinecone with user context isolation
  if (process.env.PINECONE_API_KEY) {
    try {
      const index = pinecone.index(pineconeIndexName);
      
      // Construct metadata filter to isolate User A's uploads from User B's,
      // while allowing all users to see public/system seed documentation.
      const filter = currentUserId
        ? { user_id: { $in: [currentUserId, 'system'] } }
        : { user_id: { $eq: 'system' } };

      const queryResponse = await index.query({
        vector: queryVector,
        topK: 3,
        includeMetadata: true,
        filter: filter
      });

      matches = queryResponse.matches.map(match => ({
        text: match.metadata ? match.metadata.text : '',
        similarity: match.score || 0
      }));
      console.log(`[ragService] Retrieved ${matches.length} matches from Pinecone (filter: ${JSON.stringify(filter)}).`);
    } catch (err) {
      console.error("[ragService] Pinecone query failed, falling back to local database search:", err);
    }
  }

  // Fallback to LocalVectorDB if Pinecone is not set up or query returned empty results
  if (matches.length === 0) {
    const { localVectorDBInstance } = require('../config/db');
    const localMatches = localVectorDBInstance.search(queryVector, 3);
    matches = localMatches.map(match => ({
      text: match.text,
      similarity: match.similarity
    }));
    console.log(`[ragService] Fallback: Retrieved ${matches.length} matches from local vector database.`);
  }

  // Extract text from retrieved chunks and separate by newlines
  const context = matches.map(match => match.text).join('\n');

  // Construct the strict prompt payload
  const prompt = `You are an authorized, secure corporate AI assistant. Answer the user's question safely, professionally, and accurately using ONLY the facts provided in the Context section below. 

Context:
${context}

User Question: ${userQuery}

Constraint: If the answer cannot be confidently derived from the provided context, you must strictly reply with: 'I am sorry, but I do not have access to that information in the official company documents.'`;

  // Generate answer with fallback list
  return await generateWithFallback(ai, prompt);
}

module.exports = {
  queryCompanyRAG
};
