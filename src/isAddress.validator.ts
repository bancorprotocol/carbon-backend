import { BadRequestException } from '@nestjs/common';
import { registerDecorator, ValidationOptions } from 'class-validator';
import { isAddress, toChecksumAddress } from 'web3-utils';

export function IsAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isLongerThan',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: {
        ...validationOptions,
        message: `${propertyName} must be a valid ethereum address`,
      },
      validator: {
        validate(value: any) {
          try {
            const address = toChecksumAddress(value);
            return isAddress(address);
          } catch (error) {
            return false;
          }
        },
      },
    });
  };
}

export function formatEthereumAddress(value): string {
  try {
    return toChecksumAddress(value.value);
  } catch (error) {
    throw new BadRequestException({
      message: [`${value.key} must be a valid address, the value ${value.value} is invalid`],
      error: 'Bad Request',
      statusCode: 400,
    });
  }
}
