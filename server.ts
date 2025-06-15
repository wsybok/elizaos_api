import express from 'express';
import { createOracleAPI } from './src/api/oracle';
import dotenv from 'dotenv';

// Load environment variables from parent directory
dotenv.config({ path: '../.env' });

const app = express();
const port = process.env.PORT || 3000;

// Use the oracle API routes
app.use('/api', createOracleAPI());

// Basic health check
app.get('/', (req, res) => {
  res.json({
    message: 'ElizaOS Oracle API',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`🚀 ElizaOS Oracle API server running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/`);
  console.log(`Oracle API: http://localhost:${port}/api/oracle/*`);
});

export default app; 