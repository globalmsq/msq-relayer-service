import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ConsumerService } from './consumer.service';
import { SqsAdapter } from './sqs/sqs.adapter';
import { OzRelayerClient } from './relay/oz-relayer.client';
import { PrismaService } from './prisma/prisma.service';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    HttpModule,
  ],
  providers: [
    ConsumerService,
    SqsAdapter,
    OzRelayerClient,
    PrismaService,
  ],
})
export class ConsumerModule {}
