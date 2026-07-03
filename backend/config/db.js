const { Pool } = require('pg');
const { GoogleGenAI } = require('@google/genai');
const { Pinecone } = require('@pinecone-database/pinecone');

// PostgreSQL client pool initialization
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
});

// Initialize Pinecone Client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY || '',
});
const pineconeIndexName = 'omni-search';

// Global In-memory Indexes for sync vector search compatibility / fallback
let vectorIndex = []; // Array of { id, docId, docTitle, text, embedding }

// LocalVectorDB singleton class
class LocalVectorDB {
  constructor() {
    if (LocalVectorDB.instance) {
      return LocalVectorDB.instance;
    }
    this.vectors = []; // each record contains an ID, raw text chunk, and a numerical vector array
    LocalVectorDB.instance = this;
  }

  // internal helper to compute Cosine Similarity
  _cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  addRecord(id, text, vector) {
    const index = this.vectors.findIndex(r => r.id === id);
    if (index !== -1) {
      this.vectors[index] = { id, text, vector };
    } else {
      this.vectors.push({ id, text, vector });
    }
  }

  search(queryVector, limit = 3) {
    if (this.vectors.length === 0) return [];
    
    const scored = this.vectors.map(record => {
      const similarity = this._cosineSimilarity(queryVector, record.vector);
      return {
        id: record.id,
        text: record.text,
        similarity,
        vector: record.vector
      };
    });

    // Sort by similarity descending
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit);
  }

  clear() {
    this.vectors = [];
  }
}

// Singleton database instance
const localVectorDBInstance = new LocalVectorDB();

// Embed content helper utilizing @google/genai SDK
async function getEmbedding(text, model = 'text-embedding-004') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not defined in environment.");
  }
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.embedContent({
      model: model,
      contents: text
    });
    if (response.embeddings && response.embeddings[0]) {
      return response.embeddings[0].values;
    } else if (response.embedding) {
      return response.embedding.values;
    }
    throw new Error("Invalid embedding response format");
  } catch (error) {
    // If text-embedding-004 fails, fallback to gemini-embedding-001
    if (model === 'text-embedding-004' && (error.status === 404 || error.message.includes('not found') || error.message.includes('404'))) {
      console.warn(`[LocalVectorDB] text-embedding-004 not found or supported. Falling back to gemini-embedding-001.`);
      const fallbackResponse = await ai.models.embedContent({
        model: 'gemini-embedding-001',
        contents: text
      });
      if (fallbackResponse.embeddings && fallbackResponse.embeddings[0]) {
        return fallbackResponse.embeddings[0].values;
      } else if (fallbackResponse.embedding) {
        return fallbackResponse.embedding.values;
      }
      throw new Error("Invalid fallback embedding response format");
    }
    throw error;
  }
}

// Initial seed documents (Disabled to strictly render user-uploaded content)
const seedDocuments = [];

// Helper: Chunking long text semantically
function chunkText(text, maxChunkSize = 700, overlap = 100) {
  const paragraphs = text.split(/\n+/);
  const chunks = [];
  let currentChunk = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;

    if (para.length > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      
      const sentences = para.match(/[^.!?]+[.!?]+(\s|$)/g) || [para];
      let tempChunk = "";
      for (const sentence of sentences) {
        if (tempChunk.length + sentence.length > maxChunkSize) {
          if (tempChunk) chunks.push(tempChunk.trim());
          tempChunk = sentence;
        } else {
          tempChunk += sentence;
        }
      }
      if (tempChunk) {
        currentChunk = tempChunk;
      }
    } else {
      if (currentChunk.length + para.length + 2 > maxChunkSize) {
        chunks.push(currentChunk.trim());
        const lastPart = currentChunk.slice(-overlap);
        currentChunk = lastPart + "\n\n" + para;
      } else {
        currentChunk = currentChunk ? currentChunk + "\n\n" + para : para;
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

// Initialise Database (creates tables, Pinecone index, seeds documents, loads vectors)
async function initializeDB() {
  try {
    // 1. Create SQL tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        chat_id VARCHAR(255) REFERENCES chats(id) ON DELETE CASCADE,
        sender VARCHAR(50) NOT NULL CHECK (sender IN ('user', 'bot')),
        text TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        file_name VARCHAR(255),
        file_size INTEGER,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        content TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS vectors (
        id VARCHAR(255) PRIMARY KEY,
        doc_id VARCHAR(255) REFERENCES documents(id) ON DELETE CASCADE,
        doc_title VARCHAR(255),
        text TEXT NOT NULL,
        embedding JSONB NOT NULL
      );
    `);

    console.log("[Database] All PostgreSQL tables verified/created.");

    // 2. Setup Pinecone Index
    if (process.env.PINECONE_API_KEY) {
      console.log("[Database] Checking Pinecone index initialization...");
      const indexesRes = await pinecone.listIndexes();
      const indexExists = indexesRes.indexes.some(idx => idx.name === pineconeIndexName);
      if (!indexExists) {
        console.log(`[Database] Index "${pineconeIndexName}" not found. Creating serverless Pinecone index...`);
        await pinecone.createIndex({
          name: pineconeIndexName,
          dimension: 3072,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        console.log(`[Database] Index "${pineconeIndexName}" created successfully.`);
        // Sleep a bit for index to provision
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        console.log(`[Database] Pinecone index "${pineconeIndexName}" exists and is ready.`);
      }
    } else {
      console.warn("WARNING: PINECONE_API_KEY is not defined in environment.");
    }

    console.log("[Database] Automatic database seeding is disabled.");

    // Check vectors table and restore local arrays from DB
    const vectorsRes = await pool.query('SELECT COUNT(*)::int as count FROM vectors');
    const vectorsNeedRebuilt = vectorsRes.rows[0].count === 0;

    localVectorDBInstance.clear();
    vectorIndex = [];

    if (vectorsNeedRebuilt) {
      console.log("[Database] Rebuilding vector embeddings using Gemini...");
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        const allDocs = await pool.query('SELECT * FROM documents');
        for (const doc of allDocs.rows) {
          const chunks = chunkText(doc.content);
          const recordsToUpsert = [];
          for (let i = 0; i < chunks.length; i++) {
            const chunkTextContent = chunks[i];
            try {
              const embedding = await getEmbedding(chunkTextContent, 'gemini-embedding-001');
              const chunkId = `${doc.id}_chunk_${i}`;
              
              await pool.query(
                'INSERT INTO vectors (id, doc_id, doc_title, text, embedding) VALUES ($1, $2, $3, $4, $5)',
                [chunkId, doc.id, doc.title, chunkTextContent, JSON.stringify(embedding)]
              );
              
              localVectorDBInstance.addRecord(chunkId, chunkTextContent, embedding);
              vectorIndex.push({
                id: chunkId,
                docId: doc.id,
                docTitle: doc.title,
                text: chunkTextContent,
                embedding: embedding
              });

              recordsToUpsert.push({
                id: chunkId,
                values: embedding,
                metadata: {
                  user_id: doc.user_id || 'system',
                  document_id: doc.id,
                  doc_title: doc.title,
                  text: chunkTextContent
                }
              });
            } catch (err) {
              console.error(`Failed to embed chunk ${i} of doc "${doc.title}":`, err.message);
            }
          }
          if (recordsToUpsert.length > 0 && process.env.PINECONE_API_KEY) {
            const index = pinecone.index(pineconeIndexName);
            await index.upsert({ records: recordsToUpsert });
          }
        }
      }
    } else {
      const allVectors = await pool.query('SELECT * FROM vectors');
      console.log(`[Database] Loading ${allVectors.rows.length} vector chunks from DB...`);
      for (const item of allVectors.rows) {
        const embeddingArray = typeof item.embedding === 'string' ? JSON.parse(item.embedding) : item.embedding;
        localVectorDBInstance.addRecord(item.id, item.text, embeddingArray);
        vectorIndex.push({
          id: item.id,
          docId: item.doc_id,
          docTitle: item.doc_title,
          text: item.text,
          embedding: embeddingArray
        });
      }
    }

    const usersCount = await pool.query('SELECT COUNT(*)::int as count FROM users');
    const docsCount = await pool.query('SELECT COUNT(*)::int as count FROM documents');
    console.log(`Database loaded successfully: ${usersCount.rows[0].count} users, ${docsCount.rows[0].count} documents.`);
  } catch (error) {
    console.error("Error initializing Database:", error);
    throw error;
  }
}

// User mapping helper
function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password_hash,
    createdAt: row.created_at
  };
}

// Document mapping helper
function mapDocumentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    file_name: row.file_name,
    file_size: row.file_size,
    title: row.title,
    type: row.type,
    content: row.content,
    date: row.uploaded_at
  };
}

// User methods
async function getUsers() {
  const res = await pool.query('SELECT * FROM users');
  return res.rows.map(mapUserRow);
}

// Retrieve user by email
async function getUserByEmail(email) {
  const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  return mapUserRow(res.rows[0]);
}

// Retrieve user by id
async function getUserById(id) {
  const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return mapUserRow(res.rows[0]);
}

// Save user
async function saveUser(user) {
  await pool.query(
    'INSERT INTO users (id, name, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
    [user.id, user.name || null, user.email, user.password, user.createdAt || new Date()]
  );
  return user;
}

// Document & Vector methods
async function getDocuments(userId = null) {
  let res;
  if (userId) {
    res = await pool.query('SELECT * FROM documents WHERE user_id = $1 OR user_id IS NULL ORDER BY uploaded_at DESC', [userId]);
  } else {
    res = await pool.query('SELECT * FROM documents ORDER BY uploaded_at DESC');
  }
  return res.rows.map(mapDocumentRow);
}

function deleteDocumentVectors(docId) {
  if (localVectorDBInstance && localVectorDBInstance.vectors) {
    localVectorDBInstance.vectors = localVectorDBInstance.vectors.filter(v => !v.id.startsWith(docId + '_'));
  }
  vectorIndex = vectorIndex.filter(v => v.docId !== docId);
  console.log(`[Database] Cleaned up local fallback vector database for doc: ${docId}`);
}

async function addDocument(title, content, type, userId = null, customFileName = null, customFileSize = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment.");
  }

  const docId = "doc_" + Date.now();
  const fileName = customFileName || `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.txt`;
  const fileSize = customFileSize || Buffer.byteLength(content, 'utf8');

  // 1. Add to documents table
  await pool.query(
    'INSERT INTO documents (id, user_id, file_name, file_size, uploaded_at, title, type, content) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [docId, userId, fileName, fileSize, new Date().toISOString(), title, type || "General Document", content]
  );

  // 2. Compute embeddings and add to vectors table
  const chunks = chunkText(content);
  const recordsToUpsert = [];
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    try {
      const embedding = await getEmbedding(text, 'gemini-embedding-001');
      const chunkId = `${docId}_chunk_${i}`;
      
      await pool.query(
        'INSERT INTO vectors (id, doc_id, doc_title, text, embedding) VALUES ($1, $2, $3, $4, $5)',
        [chunkId, docId, title, text, JSON.stringify(embedding)]
      );
      
      localVectorDBInstance.addRecord(chunkId, text, embedding);
      vectorIndex.push({
        id: chunkId,
        docId: docId,
        docTitle: title,
        text: text,
        embedding: embedding
      });

      recordsToUpsert.push({
        id: chunkId,
        values: embedding,
        metadata: {
          user_id: userId || 'system',
          document_id: docId,
          doc_title: title,
          text: text
        }
      });
    } catch (err) {
      console.error(`Failed to embed chunk ${i} for new doc "${title}":`, err.message);
      // Clean up document on failure
      await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
      throw new Error(`Embedding generation failed: ${err.message}`);
    }
  }

  // Upsert to Pinecone if configured
  if (recordsToUpsert.length > 0 && process.env.PINECONE_API_KEY) {
    const index = pinecone.index(pineconeIndexName);
    await index.upsert({ records: recordsToUpsert });
  }

  return {
    id: docId,
    title,
    type: type || "General Document",
    date: new Date().toISOString()
  };
}

// Updated searchVectors to be async and fetch from Pinecone index with user-specific fallback filtering
async function searchVectors(queryEmbedding, limit = 3, userId = null) {
  if (process.env.PINECONE_API_KEY) {
    try {
      const index = pinecone.index(pineconeIndexName);
      
      // Multi-tenant user filtering
      const filter = userId ? { user_id: { $in: [userId, 'system'] } } : { user_id: { $eq: 'system' } };

      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true,
        filter: filter
      });

      return queryResponse.matches.map(match => {
        return {
          docId: match.metadata ? match.metadata.document_id : '',
          docTitle: match.metadata ? match.metadata.doc_title : '',
          text: match.metadata ? match.metadata.text : '',
          similarity: match.score || 0
        };
      });
    } catch (error) {
      console.error("[Database] Pinecone search error, falling back to local search:", error);
    }
  }

  // Fallback to local sync search
  const matches = localVectorDBInstance.search(queryEmbedding, limit);
  return matches.map(match => {
    const originalChunk = vectorIndex.find(c => c.id === match.id);
    return {
      docId: originalChunk ? originalChunk.docId : '',
      docTitle: originalChunk ? originalChunk.docTitle : '',
      text: match.text,
      similarity: match.similarity
    };
  });
}

module.exports = {
  pool,
  pinecone,
  pineconeIndexName,
  LocalVectorDB,
  localVectorDBInstance,
  initializeDB,
  getUsers,
  getUserByEmail,
  getUserById,
  saveUser,
  getDocuments,
  addDocument,
  searchVectors,
  getEmbedding,
  deleteDocumentVectors
};
