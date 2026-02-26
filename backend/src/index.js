const http = require('http');
const app = require('./app');
const { config } = require('./config');
const { initSocket } = require('./socket');
require('./queue/schedulingWorker'); // register worker

const server = http.createServer(app);
initSocket(server);

server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});
