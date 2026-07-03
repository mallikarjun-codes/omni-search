const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const auth = require('../middleware/auth');

// Protect all chat endpoints with JWT middleware
router.use(auth);

// @route   POST /api/chats
// @desc    Create a new chat session thread
router.post('/', sessionController.createChat);

// @route   GET /api/chats
// @desc    Fetch all active chat sessions belonging only to the logged-in user
router.get('/', sessionController.getChats);

// @route   GET /api/chats/:chatId/messages
// @desc    Retrieve historical messages inside a specific session thread
router.get('/:chatId/messages', sessionController.getChatMessages);

// @route   DELETE /api/chats/:chatId
// @desc    Delete a targeted chat thread and all related messages (cascade)
router.delete('/:chatId', sessionController.deleteChat);

module.exports = router;
