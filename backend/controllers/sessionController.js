const db = require('../config/db');

// POST /api/chats
// Creates a new chat session thread for the logged-in user; defaults title to 'New Chat'.
exports.createChat = async (req, res) => {
  const { title } = req.body;
  const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
  const userId = rawUserId ? String(rawUserId) : null;
  const chatId = 'chat_' + Date.now();
  const chatTitle = title || 'New Chat';

  try {
    await db.pool.query(
      'INSERT INTO chats (id, user_id, title) VALUES ($1, $2, $3)',
      [chatId, userId, chatTitle]
    );

    res.status(201).json({
      id: chatId,
      title: chatTitle,
      user_id: userId,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ error: 'Server error creating chat session.' });
  }
};

// GET /api/chats
// Fetches all active chat sessions belonging only to the logged-in user, ordered by created_at DESC.
exports.getChats = async (req, res) => {
  const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
  const userId = rawUserId ? String(rawUserId) : null;

  try {
    const result = await db.pool.query(
      'SELECT id, title, created_at FROM chats WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ error: 'Server error fetching chat sessions.' });
  }
};

// GET /api/chats/:chatId/messages
// Retrieves the complete historical array log of messages inside a specific session thread.
exports.getChatMessages = async (req, res) => {
  const { chatId } = req.params;
  const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
  const userId = rawUserId ? String(rawUserId) : null;

  try {
    // Check if the chat exists and belongs to the user
    const chatCheck = await db.pool.query(
      'SELECT id FROM chats WHERE id = $1 AND user_id = $2',
      [chatId, userId]
    );

    if (chatCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Chat session not found or access denied.' });
    }

    const result = await db.pool.query(
      'SELECT id, sender, text, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching chat messages:', error);
    res.status(500).json({ error: 'Server error fetching messages.' });
  }
};

// DELETE /api/chats/:chatId
// Deletes a targeted chat thread along with all its cascading historical messages.
exports.deleteChat = async (req, res) => {
  const { chatId } = req.params;
  const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
  const userId = rawUserId ? String(rawUserId) : null;

  try {
    // Delete target chat. The database schema has "ON DELETE CASCADE" for messages
    const deleteRes = await db.pool.query(
      'DELETE FROM chats WHERE id = $1 AND user_id = $2 RETURNING id',
      [chatId, userId]
    );

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Chat session not found or access denied.' });
    }

    res.json({ message: 'Chat thread and cascading messages deleted successfully.' });
  } catch (error) {
    console.error('Error deleting chat:', error);
    res.status(500).json({ error: 'Server error deleting chat session.' });
  }
};
