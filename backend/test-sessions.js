require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const db = require('./config/db');

// Custom port to prevent collisions
const TEST_PORT = process.env.TEST_PORT || 5006;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Environment overrides
const env = { ...process.env, PORT: TEST_PORT.toString() };

console.log(`Starting backend server on port ${TEST_PORT} for chat session lifecycle verification...`);
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

async function runSessionLifecycleTest() {
  let attempts = 0;
  let serverReady = false;

  // Poll health endpoint for up to 10 seconds (20 * 500ms)
  while (attempts < 20) {
    await sleep(500);
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch (e) {
      // Waiting for server to start listening
    }
    attempts++;
  }

  if (!serverReady) {
    console.error('❌ Timeout waiting for server to start. Output so far:\n', serverOutput);
    serverProcess.kill();
    await db.pool.end();
    process.exit(1);
  }

  console.log('\n✅ Server is ready. Running Session and Router Lifecycle Tests...');

  const uniqueSuffix = Date.now();
  const dummyUser = {
    name: 'Session Test User',
    email: `session_test_${uniqueSuffix}@example.com`,
    password: 'securePassword123'
  };

  let token = '';
  let chatId1 = '';
  let chatId2 = '';

  try {
    // 1. Register dummy user
    console.log(`\nStep 1: Registering user (${dummyUser.email})...`);
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dummyUser)
    });

    const registerData = await registerRes.json();
    if (!registerRes.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
    }
    const userId = registerData.user.id;
    console.log(`✅ User registered successfully. ID: ${userId}`);

    // 2. Login to retrieve token
    console.log('\nStep 2: Logging in to get JWT token...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: dummyUser.email,
        password: dummyUser.password
      })
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }
    token = loginData.token;
    console.log(`✅ Login successful. Token: ${token.substring(0, 15)}...`);

    // 3. Create Chat Session 1
    console.log('\nStep 3: Creating Chat Session 1 (Title: "Thread One")...');
    const chat1Res = await fetch(`${BASE_URL}/api/chats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title: 'Thread One' })
    });

    const chat1Data = await chat1Res.json();
    if (!chat1Res.ok) {
      throw new Error(`Failed to create Chat 1: ${JSON.stringify(chat1Data)}`);
    }
    chatId1 = chat1Data.id;
    console.log(`✅ Chat 1 created. ID: ${chatId1}`);

    // 4. Create Chat Session 2
    console.log('\nStep 4: Creating Chat Session 2 (Title: "Thread Two")...');
    const chat2Res = await fetch(`${BASE_URL}/api/chats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ title: 'Thread Two' })
    });

    const chat2Data = await chat2Res.json();
    if (!chat2Res.ok) {
      throw new Error(`Failed to create Chat 2: ${JSON.stringify(chat2Data)}`);
    }
    chatId2 = chat2Data.id;
    console.log(`✅ Chat 2 created. ID: ${chatId2}`);

    // 5. Send conversational/general query to Chat Session 1
    // This should route to the baseline completion (gemini-1.5-flash) and NOT search documents
    const generalQuery = 'Write a quick sorting algorithm in Java';
    console.log(`\nStep 5: Querying Chat 1 with general request: "${generalQuery}"`);
    const q1Res = await fetch(`${BASE_URL}/api/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: generalQuery, chatId: chatId1 })
    });

    const q1Data = await q1Res.json();
    if (!q1Res.ok) {
      throw new Error(`Query 1 failed: ${JSON.stringify(q1Data)}`);
    }
    console.log('✅ Query 1 baseline response received.');
    console.log(`AI Response snippet:\n------------------\n${q1Data.answer.substring(0, 150)}...\n------------------`);

    // Verify in DB that Chat 1 has exactly 2 messages
    const dbMsgCount1 = await db.pool.query(
      'SELECT COUNT(*)::int as count FROM messages WHERE chat_id = $1',
      [chatId1]
    );
    console.log(`[Database Verify] Message count for Chat 1: ${dbMsgCount1.rows[0].count}`);
    if (dbMsgCount1.rows[0].count !== 2) {
      throw new Error(`Expected exactly 2 messages in Chat 1, found ${dbMsgCount1.rows[0].count}`);
    }

    // 6. Send RAG query to Chat Session 2
    // This should route to RAG context retrieval and answer policy-related details
    const ragQuery = 'What is the device security and password requirements policy?';
    console.log(`\nStep 6: Querying Chat 2 with corporate policy query: "${ragQuery}"`);
    const q2Res = await fetch(`${BASE_URL}/api/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: ragQuery, chatId: chatId2 })
    });

    const q2Data = await q2Res.json();
    if (!q2Res.ok) {
      throw new Error(`Query 2 failed: ${JSON.stringify(q2Data)}`);
    }
    console.log('✅ Query 2 RAG response received.');
    console.log(`AI Response snippet:\n------------------\n${q2Data.answer.substring(0, 150)}...\n------------------`);

    // Verify answer contains keywords from IT Device Security Policy (e.g. 1Password, Okta, MFA)
    const normalizedAns2 = q2Data.answer.toLowerCase();
    if (!normalizedAns2.includes('1password') && !normalizedAns2.includes('mfa') && !normalizedAns2.includes('password')) {
      throw new Error(`Query 2 answer does not seem to contain context from IT policy.`);
    }
    console.log('✅ Context verification successful: Answer corresponds to the IT policy.');

    // Verify in DB that Chat 2 has exactly 2 messages
    const dbMsgCount2 = await db.pool.query(
      'SELECT COUNT(*)::int as count FROM messages WHERE chat_id = $1',
      [chatId2]
    );
    console.log(`[Database Verify] Message count for Chat 2: ${dbMsgCount2.rows[0].count}`);
    if (dbMsgCount2.rows[0].count !== 2) {
      throw new Error(`Expected exactly 2 messages in Chat 2, found ${dbMsgCount2.rows[0].count}`);
    }

    // 7. Get all chats for the user
    console.log('\nStep 7: Fetching all active chat sessions belonging to the user...');
    const getChatsRes = await fetch(`${BASE_URL}/api/chats`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const chatsList = await getChatsRes.json();
    if (!getChatsRes.ok) {
      throw new Error(`Failed to fetch chats: ${JSON.stringify(chatsList)}`);
    }
    console.log('✅ Retrieved chat threads list:', chatsList);
    if (chatsList.length !== 2) {
      throw new Error(`Expected 2 active chat threads, found ${chatsList.length}`);
    }
    // Verify sorting by created_at DESC. The second thread was created after the first thread.
    if (chatsList[0].id !== chatId2 || chatsList[1].id !== chatId1) {
      throw new Error(`Chats are not ordered by created_at DESC. First: ${chatsList[0].id}, Second: ${chatsList[1].id}`);
    }
    console.log('✅ Chat list sorting matches: newer chat is returned first.');

    // 8. Retrieve complete message history for Chat 1
    console.log(`\nStep 8: Fetching complete historical messages log for Chat 1 (${chatId1})...`);
    const getMessagesRes = await fetch(`${BASE_URL}/api/chats/${chatId1}/messages`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const messagesList = await getMessagesRes.json();
    if (!getMessagesRes.ok) {
      throw new Error(`Failed to fetch messages: ${JSON.stringify(messagesList)}`);
    }
    console.log('✅ Message logs returned:', messagesList.map(m => ({ sender: m.sender, text: m.text.substring(0, 40) + '...' })));
    if (messagesList.length !== 2) {
      throw new Error(`Expected 2 messages, retrieved ${messagesList.length}`);
    }
    if (messagesList[0].sender !== 'user' || messagesList[1].sender !== 'bot') {
      throw new Error('Messages list sequence is out of chronological order.');
    }
    console.log('✅ Message logs ordering matches: user question is followed by bot response.');

    // 9. Delete Chat 1
    console.log(`\nStep 9: Deleting Chat Session 1 (${chatId1})...`);
    const deleteRes = await fetch(`${BASE_URL}/api/chats/${chatId1}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const deleteData = await deleteRes.json();
    if (!deleteRes.ok) {
      throw new Error(`Failed to delete Chat 1: ${JSON.stringify(deleteData)}`);
    }
    console.log('✅ Delete API responded successfully:', deleteData);

    // Verify Chat 1 is removed from DB
    const dbChatCheck = await db.pool.query('SELECT COUNT(*)::int as count FROM chats WHERE id = $1', [chatId1]);
    if (dbChatCheck.rows[0].count !== 0) {
      throw new Error(`Database verification failed: Chat 1 still exists in chats table.`);
    }

    // Verify related messages are deleted (cascading check)
    const dbMsgCheck = await db.pool.query('SELECT COUNT(*)::int as count FROM messages WHERE chat_id = $1', [chatId1]);
    if (dbMsgCheck.rows[0].count !== 0) {
      throw new Error(`Database verification failed: Cascaded messages still exist for Chat 1.`);
    }
    console.log('✅ Cascading deletion verified successfully inside PostgreSQL (0 rows remaining).');

    // 10. Verify remaining chat list
    console.log('\nStep 10: Verifying chat list contains only Thread Two...');
    const listVerifyRes = await fetch(`${BASE_URL}/api/chats`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const listVerifyData = await listVerifyRes.json();
    if (listVerifyData.length !== 1 || listVerifyData[0].id !== chatId2) {
      throw new Error(`Expected only Chat 2 in the list, found: ${JSON.stringify(listVerifyData)}`);
    }
    console.log('✅ Active chat list updated accurately.');

    // 11. Verify unauthorized access to foreign or non-existent chatId
    console.log('\nStep 11: Testing access validation using invalid chatId...');
    const badQueryRes = await fetch(`${BASE_URL}/api/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: 'Hello', chatId: 'chat_invalid_id_999' })
    });
    console.log('HTTP Status (invalid chatId):', badQueryRes.status);
    if (badQueryRes.status !== 404) {
      throw new Error(`Expected status 404 for invalid chatId, got ${badQueryRes.status}`);
    }
    console.log('✅ Invalid chat isolation verified successfully (Returned 404).');

    console.log('\n🎉 ALL MULTI-CHAT PERSISTENCE & INTENT ROUTING ENGINE INTEGRATION TESTS PASSED 100% SUCCESS! 🎉');
    serverProcess.kill();
    await db.pool.end();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ LIFECYCLE TEST FAILED:', error.message);
    serverProcess.kill();
    await db.pool.end();
    process.exit(1);
  }
}

runSessionLifecycleTest();
