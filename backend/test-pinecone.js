require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');

async function runTest() {
  console.log("=== STARTING PINECONE INTEGRATION AND MULTI-TENANCY TEST ===");

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    console.error("❌ ERROR: PINECONE_API_KEY is not defined in environment.");
    process.exit(1);
  }
  console.log("✅ PINECONE_API_KEY is loaded.");

  const pinecone = new Pinecone({ apiKey });
  const indexName = 'omni-search';

  try {
    // 1. Check index existence
    console.log("Step 1: Checking Pinecone index...");
    const indexesRes = await pinecone.listIndexes();
    const indexExists = indexesRes.indexes.some(idx => idx.name === indexName);
    
    if (!indexExists) {
      console.log(`Creating serverless Pinecone index "${indexName}" with dimension 3072...`);
      await pinecone.createIndex({
        name: indexName,
        dimension: 3072,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      console.log("✅ Index created. Waiting 10 seconds for provision...");
      await new Promise(resolve => setTimeout(resolve, 10000));
    } else {
      console.log(`✅ Index "${indexName}" is already initialized.`);
    }

    const index = pinecone.index(indexName);

    // 2. Generate two test vectors (3072 dimensions) representing different users' documents
    console.log("\nStep 2: Preparing mock vector payloads for User A and User B...");
    const vectorDim = 3072;
    const mockVectorA = new Array(vectorDim).fill(0).map((_, i) => (i === 0 ? 1 : 0)); // [1, 0, 0, ...]
    const mockVectorB = new Array(vectorDim).fill(0).map((_, i) => (i === 1 ? 1 : 0)); // [0, 1, 0, ...]

    const timestamp = Date.now();
    const docIdA = `doc_A_${timestamp}`;
    const docIdB = `doc_B_${timestamp}`;

    const records = [
      {
        id: `chunk_A_${timestamp}`,
        values: mockVectorA,
        metadata: {
          user_id: 'user_A',
          document_id: docIdA,
          doc_title: 'User A Secret Guidelines',
          text: 'This text belongs exclusively to User A. High security password is: ALPHA_99.'
        }
      },
      {
        id: `chunk_B_${timestamp}`,
        values: mockVectorB,
        metadata: {
          user_id: 'user_B',
          document_id: docIdB,
          doc_title: 'User B Secret Guidelines',
          text: 'This text belongs exclusively to User B. Corporate access code is: BETA_77.'
        }
      }
    ];

    // 3. Upsert records to Pinecone
    console.log("Upserting vectors to Pinecone index...");
    await index.upsert({ records: records });
    console.log("✅ Vectors upserted. Waiting 4 seconds for index compilation...");
    await new Promise(resolve => setTimeout(resolve, 4000));

    // 4. Query Pinecone using User A's credentials and verify isolation
    console.log("\nStep 3: Querying Pinecone as User A (filtering by user_id = 'user_A')...");
    const queryA = await index.query({
      vector: mockVectorA,
      topK: 2,
      includeMetadata: true,
      filter: { user_id: { $eq: 'user_A' } }
    });

    console.log("Query Results for User A:");
    console.log(JSON.stringify(queryA.matches, null, 2));

    if (queryA.matches.length === 0) {
      throw new Error("Query returned 0 results. Expected User A's document.");
    }

    // Verify User B's document was NOT retrieved
    const foundUserBDoc = queryA.matches.some(match => match.metadata.user_id === 'user_B');
    if (foundUserBDoc) {
      throw new Error("❌ FAILURE: Multi-tenant breach! User A query retrieved User B's private document.");
    }
    console.log("✅ SUCCESS: User A query returned User A's documents, and strictly isolated User B's.");

    // 5. Query Pinecone using User B's credentials and verify isolation
    console.log("\nStep 4: Querying Pinecone as User B (filtering by user_id = 'user_B')...");
    const queryB = await index.query({
      vector: mockVectorB,
      topK: 2,
      includeMetadata: true,
      filter: { user_id: { $eq: 'user_B' } }
    });

    console.log("Query Results for User B:");
    console.log(JSON.stringify(queryB.matches, null, 2));

    if (queryB.matches.length === 0) {
      throw new Error("Query returned 0 results. Expected User B's document.");
    }

    // Verify User A's document was NOT retrieved
    const foundUserADoc = queryB.matches.some(match => match.metadata.user_id === 'user_A');
    if (foundUserADoc) {
      throw new Error("❌ FAILURE: Multi-tenant breach! User B query retrieved User A's private document.");
    }
    console.log("✅ SUCCESS: User B query returned User B's documents, and strictly isolated User A's.");

    // 6. Clean up mock records to avoid polluting the index
    console.log("\nStep 5: Cleaning up mock vectors from Pinecone index...");
    await index.deleteOne({ id: `chunk_A_${timestamp}` });
    await index.deleteOne({ id: `chunk_B_${timestamp}` });
    console.log("✅ Pinecone index records deleted.");

    console.log("\n🎉 ALL PINECONE INTEGRATION & MULTI-TENANT VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉");
    process.exit(0);

  } catch (error) {
    console.error("\n❌ TEST FAILED:", error);
    process.exit(1);
  }
}

runTest();
