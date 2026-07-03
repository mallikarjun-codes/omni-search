const { spawn } = require('child_process');
const path = require('path');

// Run on a custom port to avoid conflict with any other running servers
const TEST_PORT = process.env.TEST_PORT || 5005;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Prepare environment overrides
const env = { ...process.env, PORT: TEST_PORT.toString() };

console.log(`Starting backend server on port ${TEST_PORT} for integration testing...`);
const serverProcess = spawn('node', ['server.js'], { cwd: __dirname, env });

// Capture server output to detect when it's ready and display logs
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
  
  // Wait up to 10 seconds (20 * 500ms) for the server to load vectors and start listening
  while (attempts < 20) {
    await sleep(500);
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) {
        serverReady = true;
        break;
      }
    } catch (e) {
      // Server not listening yet
    }
    attempts++;
  }

  if (!serverReady) {
    console.error('❌ Timeout waiting for server to start. Output so far:\n', serverOutput);
    serverProcess.kill();
    process.exit(1);
  }

  console.log('\n✅ Server is ready. Running API Integration Tests...');

  const dummyUser = {
    name: 'Test User',
    email: `testuser_${Date.now()}@example.com`,
    password: 'password123'
  };

  let token = '';

  try {
    // 1. Register dummy user
    console.log(`\n1. Registering dummy user (${dummyUser.email})...`);
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dummyUser)
    });

    const registerData = await registerRes.json();
    if (!registerRes.ok) {
      throw new Error(`Registration failed: ${JSON.stringify(registerData)}`);
    }
    console.log('✅ Registration successful!');

    // 2. Log in dummy user to get JWT token
    console.log('\n2. Logging in to retrieve JWT token...');
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
    console.log(`✅ Login successful! Token retrieved: ${token.substring(0, 20)}...`);

    // 3. Send authorized POST request to /api/chat/query
    // Note: The context contains facts about "Employee Benefits & Perks Policy" (remote allowance, health insurance, etc.)
    const testQuery = 'What is the remote work office setup allowance?';
    console.log(`\n3. Sending authorized query: "${testQuery}"`);
    const queryRes = await fetch(`${BASE_URL}/api/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: testQuery })
    });

    const queryData = await queryRes.json();
    console.log('HTTP Status:', queryRes.status);
    console.log('Response body:', queryData);

    if (queryRes.status !== 200) {
      throw new Error(`Query returned status code ${queryRes.status}`);
    }

    if (!queryData.answer) {
      throw new Error('Response did not contain an answer field');
    }

    console.log('\n✅ API query successful! Received answer:\n', queryData.answer);
    console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
    
    serverProcess.kill();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED:', error.message);
    serverProcess.kill();
    process.exit(1);
  }
}

// Start the test runner
runTests();
