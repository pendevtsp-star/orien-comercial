import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { permissions } from "@sgc/auth";
import { JwtAuthGuard } from "../../shared/auth.guard";
import { CurrentTenant, CurrentUser } from "../../shared/current-user.decorator";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/require-permissions.decorator";
import type { TenantContext } from "../../shared/request-context";
import { TenantContextGuard } from "../../shared/tenant-context.guard";
import { LoyaltyService } from "./loyalty.service";
@ApiTags("loyalty") @UseGuards(JwtAuthGuard,TenantContextGuard,PermissionsGuard) @RequirePermissions(permissions.customers.read) @Controller("loyalty")
export class LoyaltyController {constructor(@Inject(LoyaltyService)private readonly service:LoyaltyService){}@Get("overview")overview(@CurrentTenant()tenant:TenantContext){return this.service.overview(tenant)}@Post("campaigns")campaign(@CurrentTenant()tenant:TenantContext,@CurrentUser()user:{userId:string},@Body()body:{name:string;pointsPerReal?:number}){return this.service.createCampaign(tenant,user.userId,body)}@Get("wallets")wallets(@CurrentTenant()tenant:TenantContext,@Query("search")search?:string){return this.service.wallets(tenant,search)}@Post("award")award(@CurrentTenant()tenant:TenantContext,@CurrentUser()user:{userId:string},@Body()body:{customerId:string;points:number;reason:string}){return this.service.award(tenant,user.userId,body)}@Post("redeem")redeem(@CurrentTenant()tenant:TenantContext,@CurrentUser()user:{userId:string},@Body()body:{customerId:string;points:number;reason:string}){return this.service.redeem(tenant,user.userId,body)}}
