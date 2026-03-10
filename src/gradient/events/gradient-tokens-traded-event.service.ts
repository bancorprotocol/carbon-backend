import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokensTradedEvent } from '../../events/tokens-traded-event/tokens-traded-event.entity';
import { ContractsNames, CustomFnArgs, HarvesterService } from '../../harvester/harvester.service';
import { PairsDictionary } from '../../pair/pair.service';
import { TokensByAddress } from '../../token/token.service';
import { Deployment, DeploymentService } from '../../deployment/deployment.service';

@Injectable()
export class GradientTokensTradedEventService {
  constructor(
    @InjectRepository(TokensTradedEvent)
    private repository: Repository<TokensTradedEvent>,
    private harvesterService: HarvesterService,
    private deploymentService: DeploymentService,
  ) {}

  async update(
    endBlock: number,
    pairsDictionary: PairsDictionary,
    tokens: TokensByAddress,
    deployment: Deployment,
  ): Promise<any> {
    if (!this.deploymentService.hasGradientSupport(deployment)) return;

    return this.harvesterService.processEvents({
      entity: 'gradient-tokens-traded-events',
      contractName: ContractsNames.GradientController,
      eventName: 'TokensTraded',
      endBlock,
      repository: this.repository,
      stringFields: ['trader'],
      bigNumberFields: ['sourceAmount', 'targetAmount', 'tradingFeeAmount'],
      booleanFields: ['byTargetAmount'],
      customFns: [this.parseEvent],
      tagTimestampFromBlock: true,
      pairsDictionary,
      tokens,
      fetchCallerId: true,
      skipPreClearing: true,
      deployment,
    });
  }

  async parseEvent(args: CustomFnArgs): Promise<any> {
    const { event, rawEvent, pairsDictionary, tokens } = args;

    event['sourceToken'] = tokens[rawEvent.returnValues['sourceToken']];
    event['targetToken'] = tokens[rawEvent.returnValues['targetToken']];

    if (event['sourceToken'] && event['targetToken'] && pairsDictionary[event['sourceToken'].address]) {
      event['pair'] = pairsDictionary[event['sourceToken'].address][event['targetToken'].address];
      event['type'] = event['sourceToken'].id === event['pair']?.token0?.id ? 'sell' : 'buy';
    }

    return event;
  }
}
