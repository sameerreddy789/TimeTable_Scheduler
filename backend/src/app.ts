import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';
import { correlationIdMiddleware } from './middleware/correlationId';
import { auditLogMiddleware } from './middleware/auditLog';
import { initSentry } from './observability/sentry';
import { register, httpRequestCounter, httpRequestDuration } from './observability/metrics';
import { logger } from './observability/logger';
import authRouter from './auth/authRoutes';
import usersRouter from './routes/users';

initSentry();

const app = express();

app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(correlationIdMiddleware);
app.use(auditLogMiddleware);

// Prometheus metrics middleware
app.use((_req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = _req.route?.path ?? _req.path;
    const labels = { method: _req.method, route, status: String(res.statusCode) };
    httpRequestCounter.inc(labels);
    end(labels);
  });
  next();
});

// Metrics endpoint
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Auth routes
app.use('/auth', authRouter);

// API router
const apiRouter = express.Router();
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
apiRouter.use('/users', usersRouter);
app.use('/api', apiRouter);

// Sentry error handler (must be last)
app.use(Sentry.Handlers.errorHandler());

export default app;
