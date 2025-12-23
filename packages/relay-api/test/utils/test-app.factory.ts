import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { TEST_CONFIG } from '../fixtures/test-config';

export async function createTestApp(): Promise<INestApplication> {
  // Set environment variables for test app
  process.env.OZ_RELAYER_URL = TEST_CONFIG.oz_relayer.url;
  process.env.OZ_RELAYER_API_KEY = TEST_CONFIG.oz_relayer.api_key;
  process.env.RELAY_API_KEY = TEST_CONFIG.api.key;
  process.env.FORWARDER_ADDRESS = TEST_CONFIG.forwarder.address;
  process.env.CHAIN_ID = TEST_CONFIG.forwarder.chain_id.toString();

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ConfigService)
    .useValue({
      get: jest.fn((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'OZ_RELAYER_URL': TEST_CONFIG.oz_relayer.url,
          'OZ_RELAYER_API_KEY': TEST_CONFIG.oz_relayer.api_key,
          'RELAY_API_KEY': TEST_CONFIG.api.key,
          'apiKey': TEST_CONFIG.api.key,
          'FORWARDER_ADDRESS': TEST_CONFIG.forwarder.address,
          'CHAIN_ID': TEST_CONFIG.forwarder.chain_id,
        };
        return configMap[key] ?? defaultValue;
      }),
      getOrThrow: jest.fn((key: string) => {
        const configMap: Record<string, any> = {
          'OZ_RELAYER_URL': TEST_CONFIG.oz_relayer.url,
          'OZ_RELAYER_API_KEY': TEST_CONFIG.oz_relayer.api_key,
          'RELAY_API_KEY': TEST_CONFIG.api.key,
          'apiKey': TEST_CONFIG.api.key,
          'FORWARDER_ADDRESS': TEST_CONFIG.forwarder.address,
          'CHAIN_ID': TEST_CONFIG.forwarder.chain_id,
        };
        const value = configMap[key];
        if (value === undefined) throw new Error(`Config key ${key} not found`);
        return value;
      }),
    })
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}
