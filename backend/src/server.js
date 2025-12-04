import express from 'express';
import cors from 'cors';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { apiKeyAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import ticketRoutes from './routes/ticket.js';
import healthRoutes from './routes/health.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/api/ticket', apiKeyAuth, ticketRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
  });
});

// Start server
const PORT = config.server.port;

app.listen(PORT, () => {
  logger.info(`AI Ticket Manager Backend running on port ${PORT}`);
  logger.info(`Environment: ${config.server.nodeEnv}`);
});
