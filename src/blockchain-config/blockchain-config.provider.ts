import { ConfigService } from '@nestjs/config';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export const BlockchainConfigProvider = {
  provide: 'BLOCKCHAIN_CONFIG',
  useFactory: async (configService: ConfigService): Promise<any> => {
    let ethereumEndpoint: string;
    if (process.env.NODE_ENV === 'production') {
      const secrets = new SecretManagerServiceClient();
      const [version] = await secrets.accessSecretVersion({
        name: configService.get('CARBON_ETHEREUM_ENDPOINT'),
      });
      ethereumEndpoint = version.payload.data.toString();
    } else {
      ethereumEndpoint = configService.get('CARBON_ETHEREUM_ENDPOINT');
    }
    return {
      ethereumEndpoint,
    };
  },
  inject: [ConfigService],
};
