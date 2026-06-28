import { Injectable } from '@nestjs/common';
import { AuthAttemptType, Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { randomBytes } from 'crypto';

interface AtomicFailedAttemptInput {
  type: AuthAttemptType;
  key: string;
  maxAttempts: number;
  lockSeconds: number;
  windowSeconds: number;
  now?: Date;
}

interface AtomicFailedAttemptRow {
  attempts: number;
  blockedUntil: Date | null;
}

@Injectable()
export class AuthAttemptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findOne(type: AuthAttemptType, key: string) {
    return this.prisma.authAttempt.findUnique({
      where: {
        type_key: {
          type,
          key: key.toLowerCase(),
        },
      },
    });
  }

  create(data: Prisma.AuthAttemptCreateInput) {
    return this.prisma.authAttempt.create({ data });
  }

  update(id: string, data: Prisma.AuthAttemptUpdateInput) {
    return this.prisma.authAttempt.update({
      where: { id },
      data,
    });
  }

  async recordFailedAttemptAtomic(
    input: AtomicFailedAttemptInput,
  ): Promise<AtomicFailedAttemptRow> {
    const now = input.now ?? new Date();
    const lockedUntil = new Date(now.getTime() + input.lockSeconds * 1000);
    const key = input.key.toLowerCase();
    const [row] = await this.prisma.$queryRaw<AtomicFailedAttemptRow[]>(
      Prisma.sql`
        INSERT INTO "auth_attempts" (
          "id",
          "type",
          "key",
          "attempts",
          "window_started_at",
          "blocked_until",
          "created_at",
          "updated_at"
        )
        VALUES (
          ${createUlid()},
          ${input.type}::"AuthAttemptType",
          ${key},
          1,
          ${now}::timestamp,
          CASE WHEN ${input.maxAttempts} <= 1 THEN ${lockedUntil}::timestamp ELSE NULL END,
          ${now}::timestamp,
          ${now}::timestamp
        )
        ON CONFLICT ("type", "key") DO UPDATE SET
          "attempts" = CASE
            WHEN "auth_attempts"."blocked_until" IS NOT NULL
              AND "auth_attempts"."blocked_until" > ${now}::timestamp
              THEN "auth_attempts"."attempts"
            WHEN "auth_attempts"."window_started_at" IS NULL
              OR (
                "auth_attempts"."blocked_until" IS NOT NULL
                AND "auth_attempts"."blocked_until" <= ${now}::timestamp
              )
              OR "auth_attempts"."window_started_at" < (${now}::timestamp - (${input.windowSeconds} * interval '1 second'))
              THEN 1
            ELSE "auth_attempts"."attempts" + 1
          END,
          "window_started_at" = CASE
            WHEN "auth_attempts"."blocked_until" IS NOT NULL
              AND "auth_attempts"."blocked_until" > ${now}::timestamp
              THEN "auth_attempts"."window_started_at"
            WHEN "auth_attempts"."window_started_at" IS NULL
              OR (
                "auth_attempts"."blocked_until" IS NOT NULL
                AND "auth_attempts"."blocked_until" <= ${now}::timestamp
              )
              OR "auth_attempts"."window_started_at" < (${now}::timestamp - (${input.windowSeconds} * interval '1 second'))
              THEN ${now}::timestamp
            ELSE "auth_attempts"."window_started_at"
          END,
          "blocked_until" = CASE
            WHEN "auth_attempts"."blocked_until" IS NOT NULL
              AND "auth_attempts"."blocked_until" > ${now}::timestamp
              THEN "auth_attempts"."blocked_until"
            WHEN (
              CASE
                WHEN "auth_attempts"."window_started_at" IS NULL
                  OR (
                    "auth_attempts"."blocked_until" IS NOT NULL
                    AND "auth_attempts"."blocked_until" <= ${now}::timestamp
                  )
                  OR "auth_attempts"."window_started_at" < (${now}::timestamp - (${input.windowSeconds} * interval '1 second'))
                  THEN 1
                ELSE "auth_attempts"."attempts" + 1
              END
            ) >= ${input.maxAttempts}
              THEN ${lockedUntil}::timestamp
            ELSE NULL
          END,
          "updated_at" = ${now}::timestamp
        RETURNING "attempts", "blocked_until" AS "blockedUntil"
      `,
    );

    if (!row) {
      throw new Error('Atomic login attempt write did not return a row');
    }

    return row;
  }
}

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function createUlid(): string {
  const time = Date.now();
  const chars = new Array<string>(26);
  let remainingTime = time;

  for (let index = 9; index >= 0; index -= 1) {
    chars[index] = ENCODING[remainingTime % 32];
    remainingTime = Math.floor(remainingTime / 32);
  }

  const random = randomBytes(16);
  for (let index = 10; index < 26; index += 1) {
    chars[index] = ENCODING[random[index - 10] & 31];
  }

  return chars.join('');
}
