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
