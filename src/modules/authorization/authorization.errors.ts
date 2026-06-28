import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export const authorizationBadRequest = (code: string, message: string) =>
  new BadRequestException({ message, code });

export const authorizationForbidden = (code: string, message: string) =>
  new ForbiddenException({ message, code });

export const authorizationNotFound = (code: string, message: string) =>
  new NotFoundException({ message, code });
