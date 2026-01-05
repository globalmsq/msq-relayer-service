import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import axios, { AxiosError } from 'axios';

@Injectable()
export class OzRelayerClient {
  private readonly logger = new Logger(OzRelayerClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.baseUrl = this.configService.get<string>('relayer.url') || 'http://localhost:8081';
    this.apiKey = this.configService.get<string>('relayer.apiKey') || 'oz-relayer-shared-api-key-local-dev';
  }

  async sendToOzRelayer(requestBody: any): Promise<any> {
    try {
      this.logger.debug(`Sending to OZ Relayer: ${this.baseUrl}/relay`);

      const response = await axios.post(
        `${this.baseUrl}/relay`,
        requestBody,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        },
      );

      this.logger.log(`OZ Relayer response: ${response.status}`);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `OZ Relayer request failed: ${axiosError.message}`,
        axiosError.response?.data,
      );
      throw error;
    }
  }
}
