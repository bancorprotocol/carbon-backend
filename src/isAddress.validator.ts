import { BadRequestException } from '@nestjs/common';
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { isAddress, toChecksumAddress } from 'web3-utils';

export function IsAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAddress',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [],
      options: {
        ...validationOptions,
        message: `${propertyName} must be a valid token address or an array of valid addresses`,
      },
      validator: {
        validate(value: any, args: ValidationArguments) {
          try {
            if (Array.isArray(value)) {
              // If value is an array, validate each address
              return value.every((addr) => {
                const address = toChecksumAddress(addr);
                return isAddress(address);
              });
            } else {
              // If value is a single address
              const address = toChecksumAddress(value);
              return isAddress(address);
            }
          } catch (error) {
            return false;
          }
        },
      },
    });
  };
}

export function formatEthereumAddress(value: { value: string; key: string }): string {
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
