import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstancesClient, ImagesClient, ZoneOperationsClient } from '@google-cloud/compute';
import {
  GCE_PROJECT,
  GCE_ZONE,
  GCE_MACHINE_TYPE,
  GCE_NETWORK_TAG,
  GCE_COS_IMAGE_PROJECT,
  GCE_COS_IMAGE_FAMILY,
} from './constants';

@Injectable()
export class GceProvider {
  private readonly logger = new Logger(GceProvider.name);
  private readonly instancesClient: InstancesClient;
  private readonly imagesClient: ImagesClient;
  private readonly operationsClient: ZoneOperationsClient;
  private readonly project: string;
  private readonly zone: string;
  private readonly machineType: string;

  constructor(private readonly configService: ConfigService) {
    this.instancesClient = new InstancesClient();
    this.imagesClient = new ImagesClient();
    this.operationsClient = new ZoneOperationsClient();
    this.project = this.configService.get<string>('GCE_PROJECT') || GCE_PROJECT;
    this.zone = this.configService.get<string>('GCE_ZONE') || GCE_ZONE;
    this.machineType = this.configService.get<string>('GCE_MACHINE_TYPE') || GCE_MACHINE_TYPE;
  }

  async createInstance(
    name: string,
    env: Record<string, string>,
    image: string,
  ): Promise<{ instanceId: string; url: string }> {
    const sourceImage = await this.getCosImageUrl();
    const startupScript = this.buildStartupScript(name, image, env);

    const [operation] = await this.instancesClient.insert({
      project: this.project,
      zone: this.zone,
      instanceResource: {
        name,
        machineType: `zones/${this.zone}/machineTypes/${this.machineType}`,
        tags: { items: [GCE_NETWORK_TAG] },
        disks: [
          {
            boot: true,
            autoDelete: true,
            initializeParams: {
              sourceImage,
              diskSizeGb: '30',
              diskType: `zones/${this.zone}/diskTypes/pd-standard`,
            },
          },
        ],
        networkInterfaces: [
          {
            network: 'global/networks/default',
            accessConfigs: [{ name: 'External NAT', type: 'ONE_TO_ONE_NAT' }],
          },
        ],
        metadata: {
          items: [{ key: 'startup-script', value: startupScript }],
        },
        serviceAccounts: [
          {
            email: 'default',
            scopes: [
              'https://www.googleapis.com/auth/devstorage.read_only',
              'https://www.googleapis.com/auth/logging.write',
            ],
          },
        ],
      },
    });

    if (operation.latestResponse) {
      await this.waitForOperation(operation.latestResponse.name as string);
    }

    const externalIp = await this.getExternalIp(name);
    const url = `http://${externalIp}:3000`;
    const instanceId = `${this.project}/${this.zone}/${name}`;

    this.logger.log(`Created GCE instance ${name} at ${url}`);
    return { instanceId, url };
  }

  async deleteInstance(name: string): Promise<void> {
    try {
      const [operation] = await this.instancesClient.delete({
        project: this.project,
        zone: this.zone,
        instance: name,
      });

      if (operation.latestResponse) {
        await this.waitForOperation(operation.latestResponse.name as string);
      }
      this.logger.log(`Deleted GCE instance: ${name}`);
    } catch (error: any) {
      if (error.code === 404 || error.message?.includes('not found')) {
        this.logger.warn(`GCE instance ${name} already deleted`);
        return;
      }
      this.logger.error(`Failed to delete GCE instance ${name}: ${error.message}`);
      throw error;
    }
  }

  async instanceExists(name: string): Promise<boolean> {
    try {
      await this.instancesClient.get({
        project: this.project,
        zone: this.zone,
        instance: name,
      });
      return true;
    } catch {
      return false;
    }
  }

  async getInstanceStatus(name: string, _instanceId: string): Promise<string | null> {
    try {
      const [instance] = await this.instancesClient.get({
        project: this.project,
        zone: this.zone,
        instance: name,
      });
      return (instance.status as string) || null;
    } catch {
      return null;
    }
  }

  private async getCosImageUrl(): Promise<string> {
    const [image] = await this.imagesClient.getFromFamily({
      project: GCE_COS_IMAGE_PROJECT,
      family: GCE_COS_IMAGE_FAMILY,
    });
    return image.selfLink as string;
  }

  private async getExternalIp(name: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const [instance] = await this.instancesClient.get({
        project: this.project,
        zone: this.zone,
        instance: name,
      });

      const ip = instance.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP;
      if (ip) return ip;

      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    throw new Error(`Could not obtain external IP for GCE instance ${name}`);
  }

  private async waitForOperation(operationName: string): Promise<void> {
    try {
      await this.operationsClient.wait({
        project: this.project,
        zone: this.zone,
        operation: operationName,
      });
    } catch (error: any) {
      this.logger.error(`Error waiting for GCE operation ${operationName}: ${error.message}`);
      throw error;
    }
  }

  private buildStartupScript(name: string, image: string, env: Record<string, string>): string {
    const envFlags = Object.entries(env)
      .map(([k, v]) => `-e ${k}='${v.replace(/'/g, "'\\''")}'`)
      .join(' \\\n    ');

    return `#!/bin/bash
set -e
echo "=== Preview VM Startup ==="

export HOME=/var/tmp
mkdir -p /var/tmp/.docker

# Wait for network/DNS to be ready (COS can take a few seconds)
echo "Waiting for network..."
for i in $(seq 1 30); do
  if nslookup google.com > /dev/null 2>&1; then
    echo "Network ready after ~\${i}s"
    break
  fi
  sleep 1
done

docker-credential-gcr configure-docker --registries=europe-west2-docker.pkg.dev

docker pull ${image}

# Block container access to the GCE metadata server (prevents secret exfiltration)
iptables -I DOCKER-USER -d 169.254.169.254 -j DROP 2>/dev/null || true

docker run -d --name preview --restart=always \\
    --dns 8.8.8.8 --dns 8.8.4.4 \\
    --log-driver=gcplogs \\
    --log-opt gcp-log-cmd=true \\
    --log-opt labels=container_name \\
    -l container_name=${name} \\
    -p 3000:3000 \\
    -p 5432:5432 \\
    ${envFlags} \\
    ${image}

echo "=== Preview container started ==="
`;
  }
}
