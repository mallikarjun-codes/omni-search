const { PDFParse } = require('pdf-parse');
const db = require('../config/db');

exports.upload = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname;
    const fileSize = req.file.size;

    // Parse the PDF buffer using PDFParse class (v2 of pdf-parse)
    const parser = new PDFParse({ data: fileBuffer });
    const pdfData = await parser.getText();
    const textContent = pdfData.text;

    if (!textContent || !textContent.trim()) {
      return res.status(400).json({ error: 'Failed to extract text from PDF or PDF is empty.' });
    }

    // Sanitize: remove null bytes and non-printable control chars that cause PostgreSQL encoding errors
    const sanitizedText = textContent
      .replace(/\x00/g, '')           // strip null bytes (breaks PostgreSQL text storage)
      .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ') // replace control chars with space
      .trim();

    if (!sanitizedText) {
      return res.status(400).json({ error: 'PDF text content is empty after sanitization.' });
    }

    // Extract fields
    const title = req.body.title || originalName.replace(/\.[^/.]+$/, "");
    const type = req.body.type || 'General Document';
    const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
    const userId = rawUserId ? String(rawUserId) : null;

    // Index the document (db.addDocument chunks, embeds, and saves to PostgreSQL)
    const newDoc = await db.addDocument(title, sanitizedText, type, userId, originalName, fileSize);

    res.status(201).json({
      message: 'PDF document successfully processed, chunked, and indexed.',
      document: {
        id: newDoc.id,
        title: newDoc.title,
        type: newDoc.type,
        date: newDoc.date
      }
    });
  } catch (error) {
    console.error('PDF Upload Controller Error:', error);
    res.status(500).json({
      error: `Failed to process and index PDF: ${error.message}`
    });
  }
};

exports.list = async (req, res) => {
  try {
    const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
    const userId = rawUserId ? String(rawUserId) : null;
    const docs = await db.getDocuments(userId);
    
    // Return document metadata without the massive contents for listings
    const metadataList = docs.map(doc => ({
      id: doc.id,
      userId: doc.user_id,
      fileName: doc.file_name,
      fileSize: doc.file_size,
      title: doc.title,
      type: doc.type,
      date: doc.date
    }));
    
    res.json(metadataList);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to retrieve documents.' });
  }
};

exports.delete = async (req, res) => {
  const { id } = req.params;
  const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
  const userId = rawUserId ? String(rawUserId) : null;

  try {
    // 1. Fetch document to verify ownership
    const docCheck = await db.pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    if (docCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = docCheck.rows[0];
    
    // Check if user is authorized to delete (only allow deleting user's own documents)
    if (doc.user_id && doc.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: You cannot delete this document.' });
    }
    
    // If it's a system document (user_id IS NULL), prevent deletion to avoid breaking tests/system states
    if (!doc.user_id) {
      return res.status(403).json({ error: 'Forbidden: You cannot delete system documents.' });
    }

    // Get vector chunk IDs associated with this document before deleting it from PostgreSQL
    const vectorCheck = await db.pool.query('SELECT id FROM vectors WHERE doc_id = $1', [id]);
    const vectorIds = vectorCheck.rows.map(row => row.id);

    // 2. Delete document from PostgreSQL documents table (cascades to vectors table)
    await db.pool.query('DELETE FROM documents WHERE id = $1', [id]);

    // 3. Drop associated vectors from Pinecone if configured
    if (process.env.PINECONE_API_KEY && vectorIds.length > 0) {
      try {
        const index = db.pinecone.index(db.pineconeIndexName);
        for (const chunkId of vectorIds) {
          await index.deleteOne({ id: chunkId });
        }
        console.log(`[documentController] Cleaned up ${vectorIds.length} vectors from Pinecone index.`);
      } catch (err) {
        console.error('[documentController] Error deleting vectors from Pinecone:', err.message);
      }
    }

    // 4. Drop associated vectors from local/in-memory fallback vector db
    db.deleteDocumentVectors(id);

    res.json({ message: 'Document and associated vectors successfully deleted.' });
  } catch (error) {
    console.error('Delete Document Error:', error);
    res.status(500).json({ error: `Failed to delete document: ${error.message}` });
  }
};

