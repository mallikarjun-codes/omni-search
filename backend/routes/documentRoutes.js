const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const documentController = require('../controllers/documentController');

// Configure multer with memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // Limit to 10MB
});

// @route   POST api/documents/upload
// @desc    Ingest and index binary PDF document
// @access  Private
router.post('/upload', auth, upload.single('file'), documentController.upload);

// @route   GET api/documents
// @desc    Get metadata list of all indexed documents for user
// @access  Private
router.get('/', auth, documentController.list);

// @route   DELETE api/documents/:id
// @desc    Delete a document and clean up vectors
// @access  Private
router.delete('/:id', auth, documentController.delete);

module.exports = router;
