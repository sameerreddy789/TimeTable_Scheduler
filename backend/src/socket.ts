import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

export function initSocket(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: { origin: '*' },
  });

  io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId as string | undefined;
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}
