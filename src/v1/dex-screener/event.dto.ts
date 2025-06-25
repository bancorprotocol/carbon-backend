import {
  IsNumberString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'blockRangeLimit', async: false })
export class BlockRangeLimitConstraint implements ValidatorConstraintInterface {
  validate(toBlock: string, args: ValidationArguments) {
    const dto = args.object as EventDto;
    const fromBlockNum = parseInt(dto.fromBlock);
    const toBlockNum = parseInt(toBlock);

    if (isNaN(fromBlockNum) || isNaN(toBlockNum)) {
      return false;
    }

    const blockRange = toBlockNum - fromBlockNum;
    return blockRange >= 0 && blockRange <= 10000;
  }

  defaultMessage(args: ValidationArguments) {
    const dto = args.object as EventDto;
    const fromBlockNum = parseInt(dto.fromBlock);
    const toBlockNum = parseInt(args.value);

    if (isNaN(fromBlockNum) || isNaN(toBlockNum)) {
      return 'fromBlock and toBlock must be valid numbers';
    }

    const blockRange = toBlockNum - fromBlockNum;

    if (blockRange < 0) {
      return 'toBlock must be greater than or equal to fromBlock';
    }

    if (blockRange > 10000) {
      return `Block range cannot exceed 10,000 blocks. Current range: ${blockRange} blocks (fromBlock: ${fromBlockNum}, toBlock: ${toBlockNum})`;
    }

    return 'Invalid block range';
  }
}

export class EventDto {
  @ApiProperty({
    description: 'Starting block number for the event query',
    example: '1000000',
    type: 'string',
  })
  @IsNumberString({}, { message: 'fromBlock must be a valid number string' })
  fromBlock: string;

  @ApiProperty({
    description:
      'Ending block number for the event query. Maximum range between fromBlock and toBlock is 10,000 blocks.',
    example: '1010000',
    type: 'string',
  })
  @IsNumberString({}, { message: 'toBlock must be a valid number string' })
  @Validate(BlockRangeLimitConstraint)
  toBlock: string;
}
