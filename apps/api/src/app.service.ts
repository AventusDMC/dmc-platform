import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      service: 'dmc-api',
      status: 'ok',
    };
  }
}
