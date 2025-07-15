export class RewardDetailDto {
  amount: string;
  timestamp: string;
}

export class RewardsResponseDto {
  rewardToken: string;
  rewards: {
    [recipient: string]: {
      [reason: string]: RewardDetailDto;
    };
  };
}

export type EncompassingJSON = RewardsResponseDto;
