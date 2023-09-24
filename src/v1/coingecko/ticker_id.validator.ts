import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function isTickerId(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isTickerId',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }

          const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}_0x[a-fA-F0-9]{40}$/;
          return ethereumAddressRegex.test(value);
        },
        defaultMessage(args: ValidationArguments) {
          return 'Invalid ticker_id format';
        },
      },
    });
  };
}
