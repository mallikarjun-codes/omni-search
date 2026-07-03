-- SQL script to clean up seed documents and chats from the PostgreSQL database

-- Delete documents and cascading vectors (due to FOREIGN KEY ... ON DELETE CASCADE constraint on vectors table)
DELETE FROM documents WHERE user_id = 'system' OR user_id IS NULL;

-- Delete chats and cascading messages
DELETE FROM chats WHERE user_id = 'system' OR user_id IS NULL;
