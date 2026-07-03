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

    // Extract fields
    const title = req.body.title || originalName.replace(/\.[^/.]+$/, "");
    const type = req.body.type || 'General Document';
    const userId = req.user ? req.user.id : null;

    // Index the document (db.addDocument chunks, embeds, and saves to PostgreSQL)
    const newDoc = await db.addDocument(title, textContent, type, userId, originalName, fileSize);

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
