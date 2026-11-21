import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';

export interface RealtimeEvent<T extends object = object> {
  name: string;
  version: 1;
  data: T;
}

/** A domain supplies its entitlement policy; the transport has no domain imports. */
export abstract class RealtimePublisher {
  abstract publishToUser<T extends object>(
    userId: string,
    event: RealtimeEvent<T>,
    entitled: (principal: AuthenticatedUser) => boolean,
  ): Promise<void>;
}
