import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { correlationIdMiddleware } from './middleware/correlationId';

const app = express();

app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(pinoHttp());
app.use(correlationIdMiddleware);

// Placeholder API router
const apiRouter = express.Router();
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.use('/api', apiRouter);

export default app;
