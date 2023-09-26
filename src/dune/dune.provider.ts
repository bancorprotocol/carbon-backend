import { ConfigService } from '@nestjs/config';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export const DuneProvider = {
  provide: 'DUNE_API_KEY',
  useFactory: async (configService: ConfigService): Promise<any> => {
    let duneApiKey: string;
    if (process.env.NODE_ENV === 'production') {
      const secrets = new SecretManagerServiceClient();
      const [version] = await secrets.accessSecretVersion({
        name: configService.get('DUNE_API_KEY'),
      });
      duneApiKey = version.payload.data.toString();
    } else {
      duneApiKey = configService.get('DUNE_API_KEY');
    }
    return duneApiKey;
  },
  inject: [ConfigService],
};
