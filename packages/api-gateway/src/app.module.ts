import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    HttpModule,
    HealthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
