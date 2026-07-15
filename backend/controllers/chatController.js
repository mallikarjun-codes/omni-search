const db = require('../config/db');
const { queryCompanyRAG } = require('../services/ragService');

// Handle RAG Chat Query
exports.query = async (req, res) => {
  const { query, chatId } = req.body;
  const rawUserId = req.user ? (req.user.id || req.user.userId) : null;
  const userId = rawUserId ? String(rawUserId) : null;

  if (!query) {
    return res.status(400).json({ error: 'Query string is required.' });
  }

  try {
    let activeChatId = chatId;

    if (activeChatId) {
      // Verify chat session exists and belongs to the logged-in user
      const chatCheck = await db.pool.query(
        'SELECT id FROM chats WHERE id = $1 AND user_id = $2',
        [activeChatId, userId]
      );
      if (chatCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Chat session not found or access denied.' });
      }
    } else {
      // If chatId is not provided, dynamically create a new session
      activeChatId = 'chat_' + Date.now();
      await db.pool.query(
        'INSERT INTO chats (id, user_id, title) VALUES ($1, $2, $3)',
        [activeChatId, userId, 'New Chat']
      );
    }

    // Call RAG execution service
    const answer = await queryCompanyRAG(query);

    // Save both the user's incoming question and the AI's generated response to DB
    const userMsgId = 'msg_' + Date.now() + '_user';
    const botMsgId = 'msg_' + (Date.now() + 5) + '_bot';

    await db.pool.query(
      'INSERT INTO messages (id, chat_id, sender, text) VALUES ($1, $2, $3, $4)',
      [userMsgId, activeChatId, 'user', query]
    );

    await db.pool.query(
      'INSERT INTO messages (id, chat_id, sender, text) VALUES ($1, $2, $3, $4)',
      [botMsgId, activeChatId, 'bot', answer]
    );

    res.json({
      answer: answer,
      chatId: activeChatId
    });
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({
      error: `Error processing RAG query: ${error.message}`
    });
  }
};

exports.queryCompanyRAG = queryCompanyRAG;
