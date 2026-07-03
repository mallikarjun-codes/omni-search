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
  // IMPORTANT: Default to RAG. Only route to GENERAL for purely conversational, math, or coding queries.
  let isConversational = false;
  try {
    const classificationPrompt = `You are a query router. Classify the user query below as either "GENERAL" or "RAG".

Route to GENERAL ONLY if the query is:
- A greeting or small-talk (e.g. "hi", "how are you", "what's up")
- A pure math calculation (e.g. "what is 2 + 2", "solve x^2 = 4")
- A request to write or explain code unrelated to any document (e.g. "write a Python hello world")

Route to RAG for EVERYTHING ELSE, including:
- Any question about a document, PDF, file, notes, or study material the user may have uploaded
- Questions about topics that could plausibly be covered in an uploaded file (e.g. "how many modules in operating system", "what is the policy on X", "explain chapter 3")
- Any factual or knowledge question that is NOT pure math or coding
- Any question mentioning "notes", "pdf", "document", "file", "chapter", "module", "lecture", "syllabus"

When in doubt, always choose RAG.

User Query: "${userQuery}"

Respond with ONLY the word "GENERAL" or "RAG".`;

    const classificationResult = await generateWithFallback(ai, classificationPrompt);
    const result = classificationResult ? classificationResult.trim().toUpperCase() : '';
    console.log(`[ragService] Query classified as: ${result}`);
    // Only mark as conversational if the model explicitly says GENERAL AND it doesn't mention documents
    if (result === 'GENERAL') {
      const documentKeywords = ['pdf', 'document', 'notes', 'file', 'module', 'chapter', 'lecture', 'syllabus', 'page', 'section', 'topic', 'content'];
      const queryLower = userQuery.toLowerCase();
      const mentionsDoc = documentKeywords.some(kw => queryLower.includes(kw));
      isConversational = !mentionsDoc;
      if (mentionsDoc) {
        console.log(`[ragService] Overriding GENERAL to RAG — query mentions document-related keyword.`);
      }
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

      console.log(`[ragService] Pinecone raw matches: ${JSON.stringify(queryResponse.matches)}`);

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
  let prompt;
  if (!context || context.trim().length === 0) {
    prompt = `You are a corporate AI assistant. The user asked: "${userQuery}"

No relevant documents were found in the database for this query. Politely inform the user that no matching documents are currently available, and suggest they upload a relevant PDF document first so you can answer questions about it.`;
  } else {
    prompt = `You are an authorized, secure corporate AI assistant. Answer the user's question accurately and in detail using the facts provided in the Context section below.

Context:
${context}

User Question: ${userQuery}

Instructions:
- Answer directly and in full based on the context above.
- If the context is relevant but incomplete, share what you know from it and mention what might be missing.
- Only say you do not have access if the context is truly empty or completely unrelated to the question.`;
  }

  // Generate answer with fallback list
  return await generateWithFallback(ai, prompt);
}

module.exports = {
  queryCompanyRAG
};
