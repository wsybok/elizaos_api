"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const oracle_1 = require("./src/api/oracle");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from parent directory
dotenv_1.default.config({ path: '../.env' });
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
// Use the oracle API routes
app.use('/api', (0, oracle_1.createOracleAPI)());
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
exports.default = app;
