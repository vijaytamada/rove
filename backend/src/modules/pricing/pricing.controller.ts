import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth.decorators.js';
import { CreatePricingPlanDto, ListPricingPlansQuery, UpdatePricingPlanDto } from './dto/pricing-plan.dto.js';
import { PricingPlansService } from './pricing-plans.service.js';

/** Pricing is a company-wide decision: every staff role can read plans, only super admins change them. */
@ApiTags('pricing')
@ApiBearerAuth()
@Controller()
export class PricingController {
  constructor(@Inject(PricingPlansService) private readonly plans: PricingPlansService) {}

  @Roles('SUPER_ADMIN', 'CITY_MANAGER', 'STATION_EMPLOYEE')
  @Get('manage/pricing-plans')
  list(@Query() query: ListPricingPlansQuery) {
    return this.plans.list(query);
  }

  @Roles('SUPER_ADMIN')
  @Post('pricing-plans')
  create(@Body() dto: CreatePricingPlanDto) {
    return this.plans.create(dto);
  }

  @Roles('SUPER_ADMIN')
  @Patch('pricing-plans/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePricingPlanDto) {
    return this.plans.update(id, dto);
  }
}
