import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { AppConfig } from "@sgc/config";
import { createClient, type RedisClientType } from "redis";
import { APP_CONFIG } from "../config/config.module";

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly client: RedisClientType;
  private connecting?: Promise<void>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createClient({ url: config.REDIS_URL });
    this.client.on("error", (error: unknown) => {
      const message = error instanceof Error ? error.message : "Redis indisponível";
      console.warn(JSON.stringify({ type: "redis_error", message }));
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      await this.connect();
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.connect();
      await this.client.set(key, value, { EX: ttlSeconds });
    } catch {
      return;
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.connect();
      await this.client.del(keys);
    } catch {
      return;
    }
  }

  async increment(key: string, ttlSeconds: number): Promise<number | null> {
    try {
      await this.connect();
      const value = await this.client.incr(key);
      if (value === 1) await this.client.expire(key, ttlSeconds);
      return value;
    } catch {
      return null;
    }
  }

  async acquireLock(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    try {
      await this.connect();
      return (await this.client.set(key, token, { EX: ttlSeconds, NX: true })) === "OK";
    } catch {
      return false;
    }
  }

  async releaseLock(key: string, token: string): Promise<void> {
    try {
      await this.connect();
      await this.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        { keys: [key], arguments: [token] },
      );
    } catch {
      return;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.connect();
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    if (this.client.isOpen) await this.client.quit();
  }

  private async connect() {
    if (this.client.isReady) return;
    this.connecting ??= this.client.connect().then(() => undefined).finally(() => {
      this.connecting = undefined;
    });
    await this.connecting;
  }
}
