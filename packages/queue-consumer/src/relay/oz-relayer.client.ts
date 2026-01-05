import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import axios, { AxiosError } from 'axios';
import { ethers } from 'ethers';

/**
 * ERC2771Forwarder execute() function ABI
 * OpenZeppelin ERC2771Forwarder v5.x signature
 */
const FORWARDER_EXECUTE_ABI = [
  'function execute((address from, address to, uint256 value, uint256 gas, uint48 deadline, bytes data, bytes signature) request)',
];

/**
 * OzRelayerClient - Queue Consumer's OZ Relayer Integration
 *
 * SPEC-QUEUE-001: Matches relay-api's OzRelayerService pattern
 * - Uses Bearer token authentication
 * - Fetches relayer ID before sending transactions
 * - Sends to /api/v1/relayers/:relayerId/transactions endpoint
 * - Handles both direct and gasless transaction types
 */
@Injectable()
export class OzRelayerClient {
  private readonly logger = new Logger(OzRelayerClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private relayerId: string | null = null;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.baseUrl =
      this.configService.get<string>('relayer.url') ||
      'http://localhost:8081';
    this.apiKey =
      this.configService.get<string>('relayer.apiKey') ||
      'oz-relayer-shared-api-key-local-dev';
  }

  /**
   * Fetch the relayer ID from OZ Relayer with caching
   * Matches relay-api's OzRelayerService.getRelayerId() pattern
   */
  private async getRelayerId(): Promise<string> {
    // Return cached ID if available
    if (this.relayerId) {
      return this.relayerId;
    }

    try {
      this.logger.debug(
        `Fetching relayer ID from: ${this.baseUrl}/api/v1/relayers`,
      );

      const response = await axios.get<{ data: Array<{ id: string }> }>(
        `${this.baseUrl}/api/v1/relayers`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        },
      );

      if (response.data?.data?.[0]?.id) {
        this.relayerId = response.data.data[0].id;
        this.logger.log(`Discovered relayer ID: ${this.relayerId}`);
        return this.relayerId;
      }

      throw new Error('No relayer found in response');
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Failed to discover relayer ID: ${axiosError.message}`,
        axiosError.response?.data,
      );
      throw new Error('Failed to discover OZ Relayer ID');
    }
  }

  /**
   * Build the forwarder execute() calldata for gasless transactions
   *
   * @param forwardRequest - The ForwardRequest struct from the gasless message
   * @param signature - The EIP-712 signature
   * @returns Hex-encoded calldata for execute() function
   */
  private buildForwarderExecuteCalldata(
    forwardRequest: {
      from: string;
      to: string;
      value: string;
      gas: string;
      nonce: string;
      deadline: string;
      data: string;
    },
    signature: string,
  ): string {
    const forwarderInterface = new ethers.Interface(FORWARDER_EXECUTE_ABI);

    // Build the ForwardRequestData struct matching OpenZeppelin v5.x
    const requestData = {
      from: forwardRequest.from,
      to: forwardRequest.to,
      value: BigInt(forwardRequest.value),
      gas: BigInt(forwardRequest.gas),
      deadline: BigInt(forwardRequest.deadline),
      data: forwardRequest.data,
      signature: signature,
    };

    // Encode the execute() call
    const calldata = forwarderInterface.encodeFunctionData('execute', [
      requestData,
    ]);

    return calldata;
  }

  /**
   * Poll OZ Relayer for transaction status until mined/failed
   * Waits for the transaction to be confirmed with an actual hash
   *
   * @param ozTxId - OZ Relayer's transaction ID
   * @param maxAttempts - Maximum polling attempts (default: 30)
   * @param delayMs - Delay between attempts in ms (default: 500)
   * @returns Transaction status with hash
   */
  private async pollForConfirmation(
    ozTxId: string,
    maxAttempts: number = 30,
    delayMs: number = 500,
  ): Promise<any> {
    const relayerId = await this.getRelayerId();
    const endpoint = `${this.baseUrl}/api/v1/relayers/${relayerId}/transactions/${ozTxId}`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(endpoint, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        });

        const txData = response.data.data || response.data;
        const status = txData.status?.toLowerCase();

        // Check if transaction reached terminal state
        if (['mined', 'confirmed', 'failed', 'reverted'].includes(status)) {
          this.logger.log(
            `Transaction ${ozTxId} reached terminal status: ${status}, hash: ${txData.hash}`,
          );
          return {
            transactionId: txData.id,
            txHash: txData.hash,
            status: txData.status,
            createdAt: txData.created_at,
          };
        }

        // Log progress every 5 attempts
        if (attempt % 5 === 0) {
          this.logger.debug(
            `Polling OZ Relayer [${attempt + 1}/${maxAttempts}]: ${ozTxId} status=${status}`,
          );
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        this.logger.warn(
          `Poll attempt ${attempt + 1} failed: ${axiosError.message}`,
        );
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    // Return last known state if max attempts reached
    this.logger.warn(`Max polling attempts reached for ${ozTxId}`);
    throw new Error(
      `Transaction ${ozTxId} did not reach terminal status after ${maxAttempts} attempts`,
    );
  }

  /**
   * Send direct transaction to OZ Relayer and wait for confirmation
   */
  async sendDirectTransaction(request: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
    speed?: string;
  }): Promise<any> {
    const relayerId = await this.getRelayerId();
    const endpoint = `${this.baseUrl}/api/v1/relayers/${relayerId}/transactions`;

    this.logger.debug(`Sending direct TX to OZ Relayer: ${endpoint}`);

    const ozRequest = {
      to: request.to,
      data: request.data,
      value: request.value ? parseInt(request.value, 10) : 0,
      gas_limit: request.gasLimit ? parseInt(request.gasLimit, 10) : 100000,
      speed: request.speed || 'average',
    };

    const response = await axios.post(endpoint, ozRequest, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 30000,
    });

    const txData = response.data.data;
    const ozTxId = txData.id;

    this.logger.log(`Direct TX submitted to OZ Relayer: ${ozTxId}`);

    // Poll until confirmed with hash (Hardhat mines immediately)
    return await this.pollForConfirmation(ozTxId);
  }

  /**
   * Send gasless transaction to OZ Relayer via Forwarder.execute() and wait for confirmation
   */
  async sendGaslessTransaction(
    request: {
      request: {
        from: string;
        to: string;
        value: string;
        gas: string;
        nonce: string;
        deadline: string;
        data: string;
      };
      signature: string;
    },
    forwarderAddress: string,
  ): Promise<any> {
    const relayerId = await this.getRelayerId();
    const endpoint = `${this.baseUrl}/api/v1/relayers/${relayerId}/transactions`;

    this.logger.debug(`Sending gasless TX to OZ Relayer: ${endpoint}`);
    this.logger.debug(`Forwarder address: ${forwarderAddress}`);

    // Build the execute() calldata
    const executeCalldata = this.buildForwarderExecuteCalldata(
      request.request,
      request.signature,
    );

    // Calculate gas limit for forwarder call (inner gas + overhead)
    const innerGas = BigInt(request.request.gas);
    const forwarderOverhead = BigInt(50000); // Forwarder execution overhead
    const totalGas = innerGas + forwarderOverhead;

    const ozRequest = {
      to: forwarderAddress,
      data: executeCalldata,
      value: parseInt(request.request.value, 10),
      gas_limit: Number(totalGas),
      speed: 'average',
    };

    const response = await axios.post(endpoint, ozRequest, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 30000,
    });

    const txData = response.data.data;
    const ozTxId = txData.id;

    this.logger.log(`Gasless TX submitted to OZ Relayer: ${ozTxId}`);

    // Poll until confirmed with hash (Hardhat mines immediately)
    return await this.pollForConfirmation(ozTxId);
  }

  /**
   * Send transaction to OZ Relayer (legacy method for compatibility)
   * Routes to appropriate handler based on message structure
   */
  async sendToOzRelayer(requestBody: any): Promise<any> {
    try {
      // Direct transaction: has top-level 'to' and 'data'
      if (requestBody.to && requestBody.data) {
        return await this.sendDirectTransaction(requestBody);
      }

      // If neither pattern matches, attempt direct transaction
      this.logger.warn(
        'Unknown request format, attempting direct transaction',
      );
      return await this.sendDirectTransaction(requestBody);
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
