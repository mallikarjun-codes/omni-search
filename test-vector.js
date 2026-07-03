// Proxy script to run the backend verification test from the workspace root
const path = require('path');

// Change process directory to backend so config and env files are read properly
process.chdir(path.join(__dirname, 'backend'));

// Execute the verification test from the backend folder
require('./backend/test-vector.js');
