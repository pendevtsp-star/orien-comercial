import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

@Injectable()
export class PasswordService {
  async hashPassword(password: string, pepper: string): Promise<string> {
    return argon2.hash(`${password}${pepper}`, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1
    });
  }

  async verifyPassword(hash: string, password: string, pepper: string): Promise<boolean> {
    return argon2.verify(hash, `${password}${pepper}`);
  }
}
