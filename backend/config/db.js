const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

// Database file paths
const dataDir = path.join(__dirname, '..', 'data');
const usersPath = path.join(dataDir, 'users.json');
const docsPath = path.join(dataDir, 'documents.json');
const vectorsPath = path.join(dataDir, 'vectors.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Global In-memory Indexes (legacy format support)
let users = [];
let documents = [];
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

// Embed content helper utilizing the new official @google/genai SDK
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
    // If text-embedding-004 fails (e.g. 404 not found or not supported for this API key), fallback to gemini-embedding-001
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

// Initial seed documents
const seedDocuments = [
  {
    id: "doc_1",
    title: "HR-01: Employee Benefits & Perks Policy",
    type: "HR Policy",
    content: `Employee Benefits & Perks Policy (Version 2026.1)

Welcome to our company. We offer a comprehensive benefits package designed to support our employees' physical, mental, and financial well-being.

1. Health & Wellness Insurance:
We provide 100% employer-covered health, dental, and vision insurance premiums for all full-time employees. Coverage begins on your first day of employment. Dependents can be added with 70% employer premium coverage.

2. Annual Paid Time Off (PTO):
All full-time employees receive 25 days of paid annual leave per calendar year. PTO accrues monthly at a rate of 2.08 days. In addition, employees receive 10 standard public holidays and 3 floating holidays for personal or religious observations.

3. Parental Leave:
We offer up to 12 weeks of fully paid parental leave for birthing, non-birthing, and adoptive parents. This leave can be taken at any point within the first year following the birth or adoption of a child.

4. Remote Work Allowance & Workspace Setup:
Our company operates on a hybrid-first model. Full-time employees are eligible for:
- A one-time $500 home office setup stipend to purchase desk, chair, monitors, or accessories.
- A monthly $50 internet/utility allowance paid out with salary.
- Co-working space pass reimbursement of up to $200/month if you prefer working outside your home.

For any questions about your benefits, contact the HR team at hr@ourcompany.com.`,
    date: new Date("2026-01-15").toISOString()
  },
  {
    id: "doc_2",
    title: "IT-02: Device & Data Security Policy",
    type: "IT Security",
    content: `IT Security and Device Management Guidelines (Version 2026.3)

Protecting our client and company data is of paramount importance. This document details the mandatory security protocols for all employees.

1. Password Requirements:
All system passwords must be managed using the approved corporate password manager (1Password).
- Passwords must be a minimum of 12 characters.
- Must contain at least one uppercase letter, one lowercase letter, one number, and one special character.
- Passwords must be changed annually.

2. Multi-Factor Authentication (MFA):
MFA is strictly enforced across all corporate systems, including email, AWS, GitHub, and HR portals. You must configure MFA using Okta Verify or Google Authenticator. SMS-based MFA is not permitted due to security vulnerability risks.

3. Virtual Private Network (VPN):
You must connect to the corporate secure VPN (Cisco AnyConnect) whenever:
- Accessing internal staging environments or production databases.
- Working from public Wi-Fi networks (e.g., coffee shops, airports).
- Accessing sensitive customer files.

4. Device Security & Workstations:
- Company laptops must run the SentinelOne security agent at all times.
- Screens must auto-lock after 5 minutes of inactivity.
- Never leave your work laptop unattended in public areas.
- USB mass storage devices are disabled on all company laptops by default to prevent data exfiltration.

Report any suspicious activity or phishing emails immediately to security@ourcompany.com.`,
    date: new Date("2026-03-10").toISOString()
  },
  {
    id: "doc_3",
    title: "OPS-03: Business Travel and Expense Reimbursement Policy",
    type: "Operations",
    content: `Business Travel and Expense Policy (Version 2026.2)

This policy defines the guidelines and procedures for business travel expenses incurred on behalf of the company.

1. Travel Booking:
All flights, hotels, and train bookings must be made through our official travel partner portal, TravelPerk. 
- Flights over 6 hours may be booked in Premium Economy. Flights under 6 hours must be booked in Standard Economy.
- Hotel accommodations should not exceed $200 per night for domestic travel and $300 per night for international travel.

2. Daily Meal Allowances (Per Diem):
The company provides a maximum daily allowance for meals and incidental expenses:
- Domestic Travel: $75 per day.
- International Travel: $100 per day.
Alcoholic beverages are not eligible for reimbursement unless part of an pre-approved client entertainment dinner.

3. Reimbursement Submission & Receipts:
- Itemized receipts are required for all expenses exceeding $25. Credit card statements alone are not accepted as proof of purchase.
- All expense claims must be submitted via Expensify within 30 days of returning from travel.
- Late submissions (older than 60 days) will be rejected, and expenses will not be reimbursed.

For queries, reach out to finance@ourcompany.com or ask in the #finance Slack channel.`,
    date: new Date("2026-02-28").toISOString()
  }
];

// Helper: Cosine Similarity between two vectors (legacy/compatibility function)
function cosineSimilarity(vecA, vecB) {
  return localVectorDBInstance._cosineSimilarity(vecA, vecB);
}

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

// Initialize Database (loads JSON files, creates seeds, handles embeddings)
async function initializeDB() {
  try {
    // 1. Users
    if (fs.existsSync(usersPath)) {
      users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    } else {
      users = [];
      fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    }

    // 2. Documents
    let docsNeedSeeding = false;
    if (fs.existsSync(docsPath)) {
      documents = JSON.parse(fs.readFileSync(docsPath, 'utf8'));
      if (documents.length === 0) {
        docsNeedSeeding = true;
      }
    } else {
      docsNeedSeeding = true;
    }

    if (docsNeedSeeding) {
      documents = seedDocuments;
      fs.writeFileSync(docsPath, JSON.stringify(documents, null, 2));
    }

    // 3. Vectors
    let vectorsNeedRebuilt = false;
    if (fs.existsSync(vectorsPath)) {
      vectorIndex = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
      if (vectorIndex.length === 0 && documents.length > 0) {
        vectorsNeedRebuilt = true;
      }
    } else {
      vectorsNeedRebuilt = true;
    }

    // Always clear the in-memory vectors before rebuilding or loading
    localVectorDBInstance.clear();

    if (vectorsNeedRebuilt) {
      console.log("Rebuilding vector embeddings index using Gemini...");
      vectorIndex = [];
      
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("WARNING: GEMINI_API_KEY is not defined in backend environment. Vector index setup will be skipped/mocked.");
      } else {
        for (const doc of documents) {
          const chunks = chunkText(doc.content);
          console.log(`Chunked "${doc.title}" into ${chunks.length} segments.`);
          
          for (let i = 0; i < chunks.length; i++) {
            const chunkTextContent = chunks[i];
            try {
              const embedding = await getEmbedding(chunkTextContent, 'gemini-embedding-001');
              const newRecord = {
                id: `${doc.id}_chunk_${i}`,
                docId: doc.id,
                docTitle: doc.title,
                text: chunkTextContent,
                embedding
              };
              vectorIndex.push(newRecord);
              localVectorDBInstance.addRecord(newRecord.id, newRecord.text, embedding);
            } catch (err) {
              console.error(`Failed to embed chunk ${i} of document "${doc.title}":`, err.message);
            }
          }
        }
        
        fs.writeFileSync(vectorsPath, JSON.stringify(vectorIndex, null, 2));
        console.log(`Successfully built and saved ${vectorIndex.length} vector chunks.`);
      }
    } else {
      console.log(`Loaded ${vectorIndex.length} vector chunks from cache.`);
      for (const item of vectorIndex) {
        localVectorDBInstance.addRecord(item.id, item.text, item.embedding);
      }
    }

    console.log(`Database loaded: ${users.length} users, ${documents.length} documents.`);
  } catch (error) {
    console.error("Error initializing Database:", error);
  }
}

// User methods
function getUsers() {
  return users;
}

// Retrieve user by email
function getUserByEmail(email) {
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

// Retrieve user by id
function getUserById(id) {
  return users.find(u => u.id === id);
}

// Save user
function saveUser(user) {
  users.push(user);
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  return user;
}

// Document & Vector methods
function getDocuments() {
  return documents;
}

async function addDocument(title, content, type) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment.");
  }

  const docId = "doc_" + Date.now();
  const newDoc = {
    id: docId,
    title,
    type: type || "General Document",
    content,
    date: new Date().toISOString()
  };

  // 1. Add to documents list
  documents.push(newDoc);
  fs.writeFileSync(docsPath, JSON.stringify(documents, null, 2));

  // 2. Compute embeddings and add to vectors
  const chunks = chunkText(content);
  const newChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    try {
      const embedding = await getEmbedding(text, 'gemini-embedding-001');
      const chunkObj = {
        id: `${docId}_chunk_${i}`,
        docId,
        docTitle: title,
        text,
        embedding
      };
      vectorIndex.push(chunkObj);
      localVectorDBInstance.addRecord(chunkObj.id, chunkObj.text, embedding);
      newChunks.push(chunkObj);
    } catch (err) {
      console.error(`Failed to embed chunk ${i} for new doc "${title}":`, err.message);
      // Remove doc from documents array since indexing failed
      documents = documents.filter(d => d.id !== docId);
      fs.writeFileSync(docsPath, JSON.stringify(documents, null, 2));
      throw new Error(`Embedding generation failed: ${err.message}`);
    }
  }

  // Update vectors on disk
  fs.writeFileSync(vectorsPath, JSON.stringify(vectorIndex, null, 2));
  return newDoc;
}

function searchVectors(queryEmbedding, limit = 3) {
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
  getEmbedding
};
