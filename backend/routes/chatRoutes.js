const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

// All chat/document endpoints require a valid JWT token
router.use(auth);

// @route   POST api/chat/query
// @desc    Perform a semantic RAG query
// @access  Private
router.post('/query', chatController.query);

// @route   POST api/chat/document
// @desc    Upload / index a new document in the vector database
// @access  Private
router.post('/document', chatController.uploadDocument);

// @route   GET api/chat/documents
// @desc    Get metadata list of all indexed documents
// @access  Private
router.get('/documents', chatController.getDocuments);

module.exports = router;
