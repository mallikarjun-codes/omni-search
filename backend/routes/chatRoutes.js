const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middleware/auth');

// All chat endpoints require a valid JWT token
router.use(auth);

// @route   POST api/chat/query
// @desc    Perform a semantic RAG query
// @access  Private
router.post('/query', chatController.query);

module.exports = router;
