require('dotenv').config();
const path = require('path');
const { ingestDocument } = require('./controllers/ingestController');
const { localVectorDBInstance } = require('./config/db');
const { queryCompanyRAG } = require('./controllers/chatController');

async function runRAGTest() {
  console.log("=== STARTING CORE RAG INFERENCE ENGINE TESTS ===");

  // 1. Ensure GEMINI_API_KEY is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ ERROR: GEMINI_API_KEY is not defined in the environment.");
    process.exit(1);
  }
  console.log("✅ GEMINI_API_KEY is loaded.");

  // 2. Clear LocalVectorDB and Ingest test corporate documents
  localVectorDBInstance.clear();
  console.log("✅ LocalVectorDB cleared.");

  const testDocPath = path.join(__dirname, 'data', 'test_corporate.txt');
  try {
    console.log(`🚀 Ingesting corporate document from: ${testDocPath}`);
    const chunkCount = await ingestDocument(testDocPath, 'test_corp');
    console.log(`✅ Ingested ${chunkCount} chunks into LocalVectorDB.`);
  } catch (error) {
    console.error("❌ Ingestion pipeline failed:", error);
    process.exit(1);
  }

  // 3. Test Query 1: Relevant Query (About pet policy)
  const query1 = "Can I bring my dog to the office?";
  console.log(`\n🚀 Sending Relevant Query: "${query1}"`);
  try {
    const answer1 = await queryCompanyRAG(query1);
    console.log(`💬 Response 1:\n------------------\n${answer1}\n------------------`);
    
    // Validate answer contains pet policy details (e.g. Fridays, HR, dogs)
    const normalizedAnswer = answer1.toLowerCase();
    const hasFridays = normalizedAnswer.includes("friday");
    const hasDogs = normalizedAnswer.includes("dog") || normalizedAnswer.includes("pet");
    
    if (hasFridays && hasDogs) {
      console.log("✅ Query 1 validation passed: Correctly retrieved and answered based on the pet policy.");
    } else {
      console.error("❌ Query 1 validation failed: Answer does not seem to mention Fridays or dogs.");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Query 1 failed with error:", error);
    process.exit(1);
  }

  // 4. Test Query 2: Irrelevant Query (What is the capital of France?)
  const query2 = "What is the capital of France?";
  console.log(`\n🚀 Sending Irrelevant Query: "${query2}"`);
  try {
    const answer2 = await queryCompanyRAG(query2);
    console.log(`💬 Response 2:\n------------------\n${answer2}\n------------------`);

    const expectedConstraint = "I am sorry, but I do not have access to that information in the official company documents.";
    
    // Trim and remove any potential wrapping quotes added by LLM
    const cleanAnswer2 = answer2.replace(/^["']|["']$/g, '').trim();

    if (cleanAnswer2 === expectedConstraint) {
      console.log("✅ Query 2 validation passed: Strict constraint block correctly triggered.");
    } else {
      console.error(`❌ Query 2 validation failed:\nExpected: "${expectedConstraint}"\nReceived: "${cleanAnswer2}"`);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Query 2 failed with error:", error);
    process.exit(1);
  }

  console.log("\n=== ALL CORE RAG INFERENCE ENGINE TESTS PASSED ===");
  process.exit(0);
}

runRAGTest();
