import http from 'http';
import app from './app';
import { config } from './config';
import { initSocket } from './socket';
import './queue/schedulingWorker'; // register worker

const server = http.createServer(app);
initSocket(server);

server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
