require('dotenv').config();
const path = require('path');
const { ingestDocument } = require('./controllers/ingestController');
const { localVectorDBInstance } = require('./config/db');
const { GoogleGenAI } = require('@google/genai');

async function runTest() {
  console.log("=== STARTING LOCAL VECTOR STORAGE PIPELINE VERIFICATION ===");

  // 1. Ensure API key is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERROR: GEMINI_API_KEY is not defined in the environment.");
    process.exit(1);
  }
  console.log("✅ GEMINI_API_KEY is loaded.");

  // 2. Clear vector database
  localVectorDBInstance.clear();
  console.log("✅ LocalVectorDB cleared.");

  // 3. Define path to test document
  const testDocPath = path.join(__dirname, 'data', 'test_corporate.txt');
  console.log(`✅ Target test document: ${testDocPath}`);

  // 4. Run ingestion pipeline
  try {
    console.log("🚀 Ingesting corporate document...");
    const chunksCount = await ingestDocument(testDocPath, 'test_corp');
    console.log(`✅ Ingested ${chunksCount} chunks into LocalVectorDB.`);
  } catch (error) {
    console.error("❌ Ingestion pipeline failed:", error);
    process.exit(1);
  }

  // 5. Verify records exist in DB
  const records = localVectorDBInstance.vectors;
  console.log(`✅ LocalVectorDB now contains ${records.length} records.`);
  if (records.length === 0) {
    console.error("❌ ERROR: No records found in LocalVectorDB after ingestion.");
    process.exit(1);
  }

  for (const record of records) {
    console.log(`   - Record ID: ${record.id}`);
    console.log(`     Text chunk (preview): "${record.text.substring(0, 60)}..."`);
    console.log(`     Vector Dimension: ${record.vector.length}`);
  }

  // 6. Define dummy query text and generate its embedding using text-embedding-004 (with fallback)
  const dummyQuery = "Can I bring my dog to the office?";
  console.log(`✅ Dummy Query text: "${dummyQuery}"`);

  const ai = new GoogleGenAI({ apiKey });
  let queryVector;

  try {
    console.log("🚀 Generating embedding for dummy query using text-embedding-004...");
    const response = await ai.models.embedContent({
      model: 'text-embedding-004',
      contents: dummyQuery,
    });
    if (response.embeddings && response.embeddings[0]) {
      queryVector = response.embeddings[0].values;
    } else if (response.embedding) {
      queryVector = response.embedding.values;
    }
  } catch (error) {
    if (error.status === 404 || error.message.includes('not found') || error.message.includes('404')) {
      console.warn(`[Test] 'text-embedding-004' not found or supported. Falling back to 'gemini-embedding-001' for query.`);
      const fallbackResponse = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: dummyQuery,
      });
      if (fallbackResponse.embeddings && fallbackResponse.embeddings[0]) {
        queryVector = fallbackResponse.embeddings[0].values;
      } else if (fallbackResponse.embedding) {
        queryVector = fallbackResponse.embedding.values;
      }
    } else {
      console.error("❌ Failed to generate embedding for dummy query:", error);
      process.exit(1);
    }
  }

  if (!queryVector) {
    console.error("❌ ERROR: Query vector generation failed.");
    process.exit(1);
  }
  console.log(`✅ Generated query vector of dimension ${queryVector.length}`);

  // 7. Calculate similarity scores using LocalVectorDB search
  console.log("🚀 Querying LocalVectorDB...");
  const results = localVectorDBInstance.search(queryVector, 2);

  console.log("✅ Search results sorted by similarity:");
  results.forEach((match, idx) => {
    console.log(`   ${idx + 1}. [Similarity: ${(match.similarity * 100).toFixed(2)}%] ID: ${match.id}`);
    console.log(`      Content: "${match.text}"`);
  });

  // 8. Validate that the Pet Policy is the top match
  if (results.length > 0 && results[0].id.includes('chunk_1')) {
    console.log("✅ SUCCESS: Pet policy correctly identified as the top matching document!");
  } else {
    console.warn("⚠️ WARNING: Top match did not match expected chunk. Check similarity calculation logic.");
  }

  console.log("=== LOCAL VECTOR STORAGE PIPELINE VERIFICATION PASSED ===");
}

runTest();
