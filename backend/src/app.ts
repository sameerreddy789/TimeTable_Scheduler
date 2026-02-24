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
import roomsRouter from './routes/rooms';
import departmentsRouter from './routes/departments';
import batchesRouter from './routes/batches';
import timeslotsRouter from './routes/timeslots';
import subjectsRouter from './routes/subjects';
import facultyRouter from './routes/faculty';
import subjectAssignmentsRouter from './routes/subjectAssignments';
import parallelSectionsRouter from './routes/parallelSections';
import electiveGroupsRouter from './routes/electiveGroups';
import blackoutDatesRouter from './routes/blackoutDates';
import scheduleRouter from './routes/schedule';
import timetableRouter from './routes/timetable';
import analyticsRouter from './routes/analytics';
import freeRoomsRouter from './routes/freeRooms';
import facultyLeaveRouter from './routes/facultyLeave';
import notificationsRouter from './routes/notifications';
import publicApiRouter from './routes/publicApi';
import softWeightsRouter from './routes/softWeights';
import importerRouter from './routes/importer';
import shareLinksRouter from './routes/shareLinks';
import wizardRouter from './routes/wizard';

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
apiRouter.use('/rooms', roomsRouter);
apiRouter.use('/departments', departmentsRouter);
apiRouter.use('/batches', batchesRouter);
apiRouter.use('/timeslots', timeslotsRouter);
apiRouter.use('/subjects', subjectsRouter);
apiRouter.use('/faculty', facultyRouter);
apiRouter.use('/subject-assignments', subjectAssignmentsRouter);
apiRouter.use('/parallel-sections', parallelSectionsRouter);
apiRouter.use('/elective-groups', electiveGroupsRouter);
apiRouter.use('/blackout-dates', blackoutDatesRouter);
apiRouter.use('/schedule', scheduleRouter);
apiRouter.use('/timetable', timetableRouter);
apiRouter.use('/analytics', analyticsRouter);
apiRouter.use('/rooms', freeRoomsRouter);
apiRouter.use('/faculty-leave', facultyLeaveRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/soft-weights', softWeightsRouter);
apiRouter.use('/import', importerRouter);
apiRouter.use('/share-links', shareLinksRouter);
apiRouter.use('/wizard', wizardRouter);
app.use('/api', apiRouter);

// Public API (API key auth, no session cookie required)
app.use('/api/v1/public', publicApiRouter);

// Sentry error handler (must be last)
app.use(Sentry.Handlers.errorHandler());

export default app;
