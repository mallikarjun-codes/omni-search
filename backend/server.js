require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Hard CORS Configuration
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Global pre-flight catch-all handler right below CORS configuration
app.options('*', cors());

// Request body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logger Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Company RAG Bot Backend'
  });
});

// Wire routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandle Error:", err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'An unexpected error occurred on the server.',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Initialize database then start server
async function startServer() {
  console.log("Starting server services...");
  await db.initializeDB();
  
  const server = app.listen(PORT, () => {
    console.log(`===============================================`);
    console.log(`🚀 Server is running on port: ${PORT}`);
    console.log(`👉 Health check: http://localhost:${PORT}/health`);
    console.log(`👉 Auth API: http://localhost:${PORT}/api/auth`);
    console.log(`👉 Chat API: http://localhost:${PORT}/api/chat`);
    console.log(`===============================================`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`[Advisory] Port ${PORT} is already occupied. Please check if another process is running on this port.`);
    } else {
      console.error('Server execution error:', error);
    }
  });
}

startServer();
