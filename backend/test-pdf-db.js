require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

const TEST_PORT = process.env.TEST_PORT || 5006;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Configure test environment variables
const env = { ...process.env, PORT: TEST_PORT.toString() };

// Propose a local pg pool connection for direct database assertions
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
});

// Binary PDF buffer for testing pdf-parse extraction
const pdfBuffer = Buffer.from(
  '%PDF-1.4\n' +
  '1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n' +
  '2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n' +
  '3 0 obj <</Type /Page /Parent 2 0 R /Resources <<>> /MediaBox [0 0 595 842] /Contents 4 0 R>> endobj\n' +
  '4 0 obj <</Length 50>> stream\n' +
  'BT\n' +
  '/F1 12 Tf\n' +
  '72 712 Td\n' +
  '(This is a test PDF document for ingestion validation!) Tj\n' +
  'ET\n' +
  'endstream\n' +
  'endobj\n' +
  'xref\n' +
  '0 5\n' +
  '0000000000 65535 f\n' +
  '0000000009 00000 n\n' +
  '0000000056 00000 n\n' +
  '0000000111 00000 n\n' +
  '0000000212 00000 n\n' +
  'trailer <</Size 5 /Root 1 0 R>>\n' +
  'startxref\n' +
  '308\n' +
  '%%EOF'
);

console.log(`Starting backend server on port ${TEST_PORT} for PDF & DB integration testing...`);
const serverProcess = spawn('node', ['server.js'], { cwd: __dirname, env });

let serverOutput = '';
serverProcess.stdout.on('data', (data) => {
  serverOutput += data.toString();
  process.stdout.write('[Server] ' + data.toString());
});

serverProcess.stderr.on('data', (data) => {
  process.stderr.write('[Server Error] ' + data.toString());
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  let attempts = 0;
  let serverReady = false;

  // Wait up to 10 seconds for the server to spin up
  while (attempts < 20) {
    await sleep(500);
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch (e) {
      // Not listening yet
    }
    attempts++;
  }

  if (!serverReady) {
    console.error('❌ Timeout waiting for server to start.');
    serverProcess.kill();
    process.exit(1);
  }

  console.log('\n✅ Server is ready. Running Integration Tests...');

  const timestamp = Date.now();
  const testUser = {
    name: 'PDF Test User',
    email: `pdftest_${timestamp}@example.com`,
    password: 'password123'
  };

  try {
    // 1. Register test user via API
    console.log(`\nStep 1: Registering test user (${testUser.email})...`);
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    const registerData = await registerRes.json();
    if (!registerRes.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
    }
    const token = registerData.token;
    const userId = registerData.user.id;
    console.log(`✅ User registered successfully. ID: ${userId}`);

    // Verify user in PostgreSQL DB
    console.log('Asserting user entry in database users table...');
    const userDbRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userDbRes.rows.length === 0) {
      throw new Error(`User ID ${userId} not found in database users table.`);
    }
    console.log(`✅ DB verification: User ${userDbRes.rows[0].email} found in users table.`);

    // 2. Create mock chat record directly in PostgreSQL
    console.log('\nStep 2: Creating mock chat record in DB...');
    const chatId = `chat_${timestamp}`;
    await pool.query(
      'INSERT INTO chats (id, user_id, title) VALUES ($1, $2, $3)',
      [chatId, userId, 'Test Chat Session']
    );

    // Verify chat in DB
    const chatDbRes = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatDbRes.rows.length === 0) {
      throw new Error(`Chat ID ${chatId} not found in database chats table.`);
    }
    console.log(`✅ DB verification: Chat "${chatDbRes.rows[0].title}" found in chats table.`);

    // Create a mock message inside the chat
    console.log('Inserting mock message in DB...');
    const messageId = `msg_${timestamp}`;
    await pool.query(
      'INSERT INTO messages (id, chat_id, sender, text) VALUES ($1, $2, $3, $4)',
      [messageId, chatId, 'user', 'Check the PDF document contents.']
    );

    // Verify message in DB
    const messageDbRes = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (messageDbRes.rows.length === 0) {
      throw new Error(`Message ID ${messageId} not found in database messages table.`);
    }
    console.log(`✅ DB verification: Message text "${messageDbRes.rows[0].text}" found in messages table.`);

    // 3. Process a real/mock sample PDF file buffer and upload it via API
    console.log('\nStep 3: Uploading PDF document via /api/documents/upload...');
    
    // Construct FormData natively
    const formData = new FormData();
    const fileBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
    formData.append('file', fileBlob, 'test_sample.pdf');
    formData.append('title', 'Integration Verification Doc');
    formData.append('type', 'IT Security');

    const uploadRes = await fetch(`${BASE_URL}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const uploadData = await uploadRes.json();
    console.log('API Response Status:', uploadRes.status);
    console.log('API Response Data:', uploadData);

    if (!uploadRes.ok) {
      throw new Error(`PDF upload failed: ${JSON.stringify(uploadData)}`);
    }
    console.log('✅ PDF upload and text ingestion successful!');

    // 4. Assert entries populate the database tables successfully
    console.log('\nStep 4: Asserting document entry exists in database...');
    const docDbRes = await pool.query('SELECT * FROM documents WHERE user_id = $1 ORDER BY uploaded_at DESC LIMIT 1', [userId]);
    if (docDbRes.rows.length === 0) {
      throw new Error('No document record found associated with this user.');
    }
    const dbDoc = docDbRes.rows[0];
    console.log(`✅ Document found in DB! File Name: ${dbDoc.file_name}, Title: ${dbDoc.title}, Content size: ${dbDoc.content.length} chars.`);

    // Assert that the text content was successfully extracted
    if (!dbDoc.content.includes('This is a test PDF document for ingestion validation!')) {
      throw new Error(`Extracted text content does not match expected contents: "${dbDoc.content}"`);
    }
    console.log('✅ PDF Text extraction verified: correct string found.');

    // Assert entries in vectors table
    console.log('Asserting chunk vector embeddings exist in DB...');
    const vectorsDbRes = await pool.query('SELECT * FROM vectors WHERE doc_id = $1', [dbDoc.id]);
    if (vectorsDbRes.rows.length === 0) {
      throw new Error('No vectors found in DB for the ingested document chunks.');
    }
    console.log(`✅ Vectors verified! Found ${vectorsDbRes.rows.length} chunk vectors for document ID ${dbDoc.id}.`);
    
    const sampleVector = typeof vectorsDbRes.rows[0].embedding === 'string' ? JSON.parse(vectorsDbRes.rows[0].embedding) : vectorsDbRes.rows[0].embedding;
    console.log(`✅ Sample vector dimension: ${sampleVector.length}`);

    // Clean up test data to keep the database tidy
    console.log('\nCleaning up integration test data...');
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    console.log('✅ Cleaned up users and cascaded tables (chats, messages, documents, vectors).');

    console.log('\n🎉 ALL PDF & DATABASE INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
    serverProcess.kill();
    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED:', error);
    serverProcess.kill();
    await pool.end();
    process.exit(1);
  }
}

runTests();
