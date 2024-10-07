import { BadRequestException } from '@nestjs/common';
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { toChecksumAddress } from 'web3-utils';

export function IsAddress(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAddress',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        ...validationOptions,
        message: `${propertyName} must be a valid token address or an array of valid addresses`,
      },
      validator: {
        validate(value: any, args: ValidationArguments) {
          try {
            if (Array.isArray(value)) {
              (args.object as any)[propertyName] = value.map((a) =>
                formatEthereumAddress({ value: a, key: args.property }),
              );
            } else {
              formatEthereumAddress({ value, key: args.property });
            }
            return true;
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
