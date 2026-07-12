import { Global, Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { SessionStateService } from "./session-state.service";

@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionStateService],
  exports: [AuthService, PasswordService, SessionStateService],
})
export class AuthModule {}
