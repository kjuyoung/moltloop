import createClient from 'openapi-fetch';
import type { paths } from './generated/api';

export type { paths };

export interface MoltLoopSDKConfig {
  baseUrl: string;
  apiKey?: string;
  token?: string;
}

export function createMoltLoopClient(config: MoltLoopSDKConfig) {
  return createClient<paths>({
    baseUrl: config.baseUrl,
    headers: {
      ...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    },
  });
}
