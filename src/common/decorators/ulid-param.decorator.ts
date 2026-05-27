import { Param } from '@nestjs/common';
import { ParseUlidPipe } from '../pipes';

export const UlidParam = (property = 'id'): ParameterDecorator =>
  Param(property, ParseUlidPipe);
