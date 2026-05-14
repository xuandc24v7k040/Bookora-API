import { type ValidationError } from '@nestjs/common';

export type ValidationErrorMap = Record<string, string[]>;

export function flattenValidationErrors(
  validationErrors: ValidationError[],
): ValidationErrorMap {
  return validationErrors.reduce<ValidationErrorMap>((errors, error) => {
    collectValidationError(errors, error);
    return errors;
  }, {});
}

function collectValidationError(
  errors: ValidationErrorMap,
  error: ValidationError,
  parentPath?: string,
): void {
  const propertyPath = parentPath
    ? `${parentPath}.${error.property}`
    : error.property;

  if (error.constraints) {
    errors[propertyPath] = Object.values(error.constraints);
  }

  error.children?.forEach((child) => {
    collectValidationError(errors, child, propertyPath);
  });
}
