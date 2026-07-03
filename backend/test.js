require('dotenv').config();
const db = require('./config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function runTest() {
  console.log("=== STARTING BACKEND VALIDATION TEST ===");
  
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERROR: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
  } else {
    console.log("✅ GEMINI_API_KEY is defined.");
  }

  try {
    console.log("1. Initializing DB...");
    await db.initializeDB();
    console.log("✅ DB Initialized.");

    console.log("\n2. Checking Loaded Documents...");
    const docs = db.getDocuments();
    console.log(`✅ Documents in DB: ${docs.length}`);
    docs.forEach(doc => {
      console.log(`  - [${doc.type}] ${doc.title} (${doc.content.length} chars)`);
    });

    console.log("\n3. Testing Semantic Search Query...");
    const query = "What is the policy for home office setup expenses?";
    console.log(`Query: "${query}"`);

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    
    console.log("Requesting query embedding...");
    const embedResult = await embedModel.embedContent(query);
    const queryEmbedding = embedResult.embedding.values;
    console.log(`✅ Received embedding vector (length: ${queryEmbedding.length})`);

    console.log("Running similarity lookup...");
    const matches = db.searchVectors(queryEmbedding, 2);
    
    console.log(`✅ Found ${matches.length} matches:`);
    matches.forEach((match, i) => {
      console.log(`\n  Match ${i + 1} (Similarity: ${(match.similarity * 100).toFixed(1)}%):`);
      console.log(`  Doc: "${match.docTitle}"`);
      console.log(`  Snippet: "${match.text.substring(0, 120)}..."`);
    });

    if (matches.length > 0 && matches[0].similarity > 0.4) {
      console.log("\n✅ SEMANTIC SEARCH TEST PASSED.");
    } else {
      console.warn("\n⚠️ WARNING: Low match similarity or no matches found.");
    }

    console.log("\n=== VALIDATION TEST SUCCESSFUL ===");
  } catch (error) {
    console.error("\n❌ TEST FAILED with error:", error);
    process.exit(1);
  }
}

runTest();
