import { Inject, Injectable } from '@nestjs/common';
import { DuneClient } from '@cowprotocol/ts-dune-client';
import { HttpService } from '@nestjs/axios';
import moment from 'moment';

@Injectable()
export class DuneService {
  constructor(@Inject('DUNE_API_KEY') private duneApiKey: any, private readonly httpService: HttpService) {}

  async query(queryId: number, ttl = 0, rowsAreJsonStrings = false): Promise<any[]> {
    let result: any = await this.httpService.axiosRef.get(
      `https://api.dune.com/api/v1/query/${queryId}/results?api_key=${this.duneApiKey}`,
    );

    const executedAt = moment(result.data.execution_started_at);
    const secondsPassed = moment().diff(executedAt, 'seconds');
    if (ttl > 0 && secondsPassed > ttl) {
      const client = new DuneClient(this.duneApiKey);
      result = await client.refresh(queryId);
      if (rowsAreJsonStrings) {
        return result.result.rows.map((r: any) => JSON.parse(r.response));
      } else {
        return result.result.rows;
      }
    }

    if (rowsAreJsonStrings) {
      return result.data.result.rows.map((r: any) => JSON.parse(r.response));
    } else {
      return result.data.result.rows;
    }
  }
}
