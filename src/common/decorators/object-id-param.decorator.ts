import { Param } from '@nestjs/common';
import { ParseObjectIdPipe } from '../pipes';

export const ObjectIdParam = (property = 'id'): ParameterDecorator =>
  Param(property, ParseObjectIdPipe);
