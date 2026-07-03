const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('../config/db');
const { queryCompanyRAG } = require('../services/ragService');

// Handle RAG Chat Query
exports.query = async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query string is required.' });
  }

  try {
    const answer = await queryCompanyRAG(query);
    res.json({
      answer: answer
    });
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({
      error: `Error processing RAG query: ${error.message}`
    });
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
