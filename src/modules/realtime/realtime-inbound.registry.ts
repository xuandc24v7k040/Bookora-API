import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';

export type RealtimeInboundName = 'chat.typing.start' | 'chat.typing.stop';
type Handler = (
  principal: AuthenticatedUser,
  payload: unknown,
  connectionId: string,
) => Promise<void>;

/** Domain extension port. The transport imports no Support service. */
@Injectable()
export class RealtimeInboundRegistry {
  private readonly handlers = new Map<RealtimeInboundName, Handler>();
  private readonly disconnectHandlers = new Set<
    (connectionId: string) => void
  >();

  register(name: RealtimeInboundName, handler: Handler): () => void {
    if (this.handlers.has(name)) throw new Error('Duplicate realtime handler');
    this.handlers.set(name, handler);
    return () => {
      this.handlers.delete(name);
    };
  }

  async dispatch(
    name: RealtimeInboundName,
    principal: AuthenticatedUser,
    payload: unknown,
    connectionId: string,
  ): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error('REALTIME_EVENT_UNAVAILABLE');
    await handler(principal, payload, connectionId);
  }

  onDisconnect(handler: (connectionId: string) => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => {
      this.disconnectHandlers.delete(handler);
    };
  }

  disconnected(id: string): void {
    for (const handler of this.disconnectHandlers) handler(id);
  }
}
