import { type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, type OnGatewayInit } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { RealtimePublisher, type RealtimeEvent } from './realtime-publisher';

interface Connection {
  socket: Socket;
  token: string;
  principal: AuthenticatedUser;
  fingerprint: string;
}

export function authorizationFingerprint(principal: AuthenticatedUser): string {
  return JSON.stringify([
    principal.type,
    principal.permissions,
    principal.branchAssignments,
  ]);
}

@WebSocketGateway({ namespace: '/realtime' })
export class RealtimeGateway
  extends RealtimePublisher
  implements OnGatewayInit, OnModuleDestroy
{
  private readonly connections = new Map<string, Connection>();
  private readonly pending = new WeakMap<Socket, Connection>();
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly authorization: AuthorizationService,
  ) {
    super();
  }

  afterInit(server: Namespace): void {
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then((connection) => {
          this.pending.set(socket, connection);
          next();
        })
        .catch(() => next(new Error('REALTIME_UNAUTHORIZED')));
    });
    server.on('connection', (socket: Socket) => {
      const connection = this.pending.get(socket);
      if (!connection) {
        socket.disconnect(true);
        return;
      }
      this.pending.delete(socket);
      this.connections.set(socket.id, connection);
      socket.once('disconnect', () => this.connections.delete(socket.id));
      void socket.join(`user:${connection.principal.id}`);
    });
    // No client-selected rooms or client-to-server domain handlers in v1.
    this.timer = setInterval(() => {
      void this.revalidateConnections();
    }, 15000);
    this.timer.unref();
  }

  private async authenticate(socket: Socket): Promise<Connection> {
    const raw = socket.handshake.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('accessToken='));
    if (!raw) throw new Error('Missing access cookie');
    const token = decodeURIComponent(raw.slice('accessToken='.length));
    const principal = await this.resolve(token);
    return {
      socket,
      token,
      principal,
      fingerprint: authorizationFingerprint(principal),
    };
  }

  private async resolve(token: string): Promise<AuthenticatedUser> {
    const claims = await this.jwt.verifyAsync<{
      sub?: string;
      sid?: string;
      exp?: number;
    }>(token, {
      secret: this.config.getOrThrow<string>('auth.jwt.accessSecret'),
      algorithms: ['HS256'],
    });
    if (!claims.sub || !claims.sid || !claims.exp)
      throw new Error('Invalid claims');
    return this.authorization.resolvePrincipal(claims.sid, claims.sub);
  }

  private async revalidate(
    connection: Connection,
  ): Promise<AuthenticatedUser | null> {
    try {
      const principal = await this.resolve(connection.token);
      if (authorizationFingerprint(principal) !== connection.fingerprint) {
        connection.socket.emit('realtime.session', {
          reason: 'AUTHORIZATION_CHANGED',
        });
        connection.socket.disconnect(true);
        return null;
      }
      return principal;
    } catch {
      connection.socket.emit('realtime.session', { reason: 'SESSION_EXPIRED' });
      connection.socket.disconnect(true);
      return null;
    }
  }

  private async revalidateConnections(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const connection of this.connections.values())
        await this.revalidate(connection);
    } finally {
      this.sweeping = false;
    }
  }

  async publishToUser<T extends object>(
    userId: string,
    event: RealtimeEvent<T>,
    entitled: (principal: AuthenticatedUser) => boolean,
  ): Promise<void> {
    if (Buffer.byteLength(JSON.stringify(event)) > 8192)
      throw new Error('Realtime payload quá lớn.');
    for (const connection of this.connections.values()) {
      if (connection.principal.id !== userId) continue;
      const principal = await this.revalidate(connection);
      if (principal && entitled(principal) && connection.socket.connected)
        connection.socket.emit(event.name, {
          version: event.version,
          ...event.data,
        });
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    for (const { socket } of this.connections.values()) socket.disconnect(true);
    this.connections.clear();
  }
}
