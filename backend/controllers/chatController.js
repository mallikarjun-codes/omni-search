const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/db');
const { queryCompanyRAG } = require('../services/ragService');

// Handle RAG Chat Query
exports.query = async (req, res) => {
  const { query, history } = req.body;

  if (!query) {
    return res.status(400).json({ message: 'Query string is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ message: 'GEMINI_API_KEY is not configured on the server.' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 1. Generate embedding for user query
    const embedModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const embedResult = await embedModel.embedContent(query);
    const queryEmbedding = embedResult.embedding.values;

    // 2. Query in-memory vector database
    // Retrieve top 3 relevant chunks
    const matches = db.searchVectors(queryEmbedding, 3);

    // 3. Format context string
    let contextString = "No matching company documents found.";
    if (matches.length > 0) {
      contextString = matches.map((match, i) => {
        return `[Source ${i + 1}: ${match.docTitle} (Similarity: ${(match.similarity * 100).toFixed(1)}%)]\n"${match.text}"`;
      }).join('\n\n');
    }

    // 4. Format chat history (limit to last 6 messages to stay within prompt limits)
    let historyText = "";
    if (history && Array.isArray(history) && history.length > 0) {
      const recentHistory = history.slice(-6);
      historyText = recentHistory.map(msg => {
        const sender = msg.role === 'user' ? 'Employee' : 'Assistant';
        return `${sender}: ${msg.content || msg.text}`;
      }).join('\n') + '\n';
    }

    // 5. Construct the full system prompt
    const prompt = `System Instructions:
You are the "Company RAG Bot", an intelligent, helpful, and highly professional AI assistant. Your purpose is to answer employee queries using the retrieved company documentation chunks provided below.

Rules for response generation:
1. Rely primarily on the "Retrieved Context" section below to answer the employee's query.
2. If the context contains the answer, explain it clearly and cite the document name (e.g. "According to HR-01: Employee Benefits & Perks Policy...").
3. If the context does not contain the answer, politely state that you cannot find this information in the company's official documents, and then provide a helpful general response while making it clear it is not official company policy.
4. Format your output using neat Markdown structures, bullet points, and headers for excellent readability. Do not make up internal urls, email addresses, or guidelines.

Retrieved Context:
${contextString}

${historyText ? `Recent Conversation History:\n${historyText}` : ''}
Employee Query: ${query}
Assistant:`;

    // 6. Request answer generation from Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 7. Filter match data to send to frontend (omit the raw embedding array for efficiency)
    const sources = matches.map(match => ({
      docTitle: match.docTitle,
      text: match.text,
      similarity: match.similarity
    }));

    res.json({
      answer: responseText,
      sources: sources
    });

  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({ message: `Error processing RAG query: ${error.message}` });
  }
};

// Handle Document Creation / Indexing
exports.uploadDocument = async (req, res) => {
  const { title, content, type } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: 'Document title and content are required.' });
  }

  try {
    const newDoc = await db.addDocument(title, content, type);
    res.status(201).json({
      message: 'Document successfully uploaded and indexed in vector store.',
      document: {
        id: newDoc.id,
        title: newDoc.title,
        type: newDoc.type,
        date: newDoc.date
      }
    });
  } catch (error) {
    console.error('Error adding document:', error);
    res.status(500).json({ message: `Failed to index document: ${error.message}` });
  }
};

// Handle Fetching All Document Metadata
exports.getDocuments = async (req, res) => {
  try {
    const docs = db.getDocuments();
    // Return document metadata without the massive contents for listings
    const metadataList = docs.map(doc => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      date: doc.date,
      charCount: doc.content.length
    }));
    res.json(metadataList);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ message: 'Error fetching documents.' });
  }
};

exports.queryCompanyRAG = queryCompanyRAG;
