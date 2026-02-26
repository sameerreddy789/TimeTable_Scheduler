const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const Sentry = require('@sentry/node');
const { correlationIdMiddleware } = require('./middleware/correlationId');
const { auditLogMiddleware } = require('./middleware/auditLog');
const { initSentry } = require('./observability/sentry');
const { register, httpRequestCounter, httpRequestDuration } = require('./observability/metrics');
const { logger } = require('./observability/logger');
const authRouter = require('./auth/authRoutes');
const usersRouter = require('./routes/users');
const roomsRouter = require('./routes/rooms');
const departmentsRouter = require('./routes/departments');
const batchesRouter = require('./routes/batches');
const timeslotsRouter = require('./routes/timeslots');
const subjectsRouter = require('./routes/subjects');
const facultyRouter = require('./routes/faculty');
const subjectAssignmentsRouter = require('./routes/subjectAssignments');
const parallelSectionsRouter = require('./routes/parallelSections');
const electiveGroupsRouter = require('./routes/electiveGroups');
const blackoutDatesRouter = require('./routes/blackoutDates');
const scheduleRouter = require('./routes/schedule');
const timetableRouter = require('./routes/timetable');
const analyticsRouter = require('./routes/analytics');
const freeRoomsRouter = require('./routes/freeRooms');
const facultyLeaveRouter = require('./routes/facultyLeave');
const notificationsRouter = require('./routes/notifications');
const publicApiRouter = require('./routes/publicApi');
const softWeightsRouter = require('./routes/softWeights');
const importerRouter = require('./routes/importer');
const shareLinksRouter = require('./routes/shareLinks');
const wizardRouter = require('./routes/wizard');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./openapi');
const { httpsRedirect, csrfProtection, sanitizeInputs, issueCsrfToken } = require('./middleware/security');

initSentry();

const app = express();

app.use(helmet());
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(httpsRedirect);
app.use(sanitizeInputs);
app.use(csrfProtection);
app.use(pinoHttp({ logger }));
app.use(correlationIdMiddleware);
app.use(auditLogMiddleware);

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

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

app.use('/auth', authRouter);
app.get('/auth/csrf-token', issueCsrfToken);

const apiRouter = express.Router();
apiRouter.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
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

app.use('/api/v1/public', publicApiRouter);

app.use(Sentry.Handlers.errorHandler());

module.exports = app;
