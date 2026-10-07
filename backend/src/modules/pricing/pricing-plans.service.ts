import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import { pageArgs, type Page } from '../../common/page-query.dto.js';
import { Prisma, type City, type PricingPlan, type VehicleModel } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { CreatePricingPlanDto, ListPricingPlansQuery, UpdatePricingPlanDto } from './dto/pricing-plan.dto.js';
import type { PlanRates } from './rental-quote.js';

/** Rates plus the plan they came from. This is also what customers see next to a scooter. */
export interface PricingView extends PlanRates {
  planId: string;
}

export interface PricingPlanView extends PlanRates {
  id: string;
  modelId: string;
  modelName: string;
  cityId: string | null;
  cityName: string | null;
  isActive: boolean;
  updatedAt: Date;
}

export const toPricingView = (p: PricingPlan): PricingView => ({
  planId: p.id,
  hourlyRateAmount: p.hourlyRateAmount,
  dailyRateAmount: p.dailyRateAmount,
  includedKmPerHour: p.includedKmPerHour,
  extraKmRateAmount: p.extraKmRateAmount,
  graceMinutes: p.graceMinutes,
  lateFeePerHourAmount: p.lateFeePerHourAmount,
  depositAmount: p.depositAmount,
});

type PlanRow = PricingPlan & { model: VehicleModel; city: City | null };

const toPlanView = (p: PlanRow): PricingPlanView => ({
  id: p.id,
  modelId: p.modelId,
  modelName: `${p.model.brand} ${p.model.name}`,
  cityId: p.cityId,
  cityName: p.city?.name ?? null,
  isActive: p.isActive,
  updatedAt: p.updatedAt,
  hourlyRateAmount: p.hourlyRateAmount,
  dailyRateAmount: p.dailyRateAmount,
  includedKmPerHour: p.includedKmPerHour,
  extraKmRateAmount: p.extraKmRateAmount,
  graceMinutes: p.graceMinutes,
  lateFeePerHourAmount: p.lateFeePerHourAmount,
  depositAmount: p.depositAmount,
});

const INCLUDE = { model: true, city: true } satisfies Prisma.PricingPlanInclude;

@Injectable()
export class PricingPlansService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** The plan a customer pays under for these models in this city: the city's own plan, else the default. */
  async resolveForModels(cityId: string, modelIds: string[]): Promise<Map<string, PricingView>> {
    const result = new Map<string, PricingView>();
    if (modelIds.length === 0) return result;
    const plans = await this.prisma.pricingPlan.findMany({
      where: { modelId: { in: modelIds }, isActive: true, OR: [{ cityId }, { cityId: null }] },
    });
    for (const modelId of modelIds) {
      const plan =
        plans.find((p) => p.modelId === modelId && p.cityId === cityId) ??
        plans.find((p) => p.modelId === modelId && p.cityId === null);
      if (plan) result.set(modelId, toPricingView(plan));
    }
    return result;
  }

  async list(query: ListPricingPlansQuery): Promise<Page<PricingPlanView>> {
    const where: Prisma.PricingPlanWhereInput = {
      ...(query.modelId && { modelId: query.modelId }),
      ...(query.cityId && { cityId: query.cityId }),
    };
    const { page, limit, skip, take } = pageArgs(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.pricingPlan.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ model: { brand: 'asc' } }, { model: { name: 'asc' } }, { cityId: { sort: 'asc', nulls: 'first' } }],
        skip,
        take,
      }),
      this.prisma.pricingPlan.count({ where }),
    ]);
    return { items: items.map(toPlanView), total, page, limit };
  }

  async create(dto: CreatePricingPlanDto): Promise<PricingPlanView> {
    const model = await this.prisma.vehicleModel.findUnique({ where: { id: dto.modelId } });
    if (!model) throw new AppException(400, 'MODEL_NOT_FOUND', 'Choose a vehicle model.');
    if (dto.cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: dto.cityId } });
      if (!city) throw new AppException(400, 'CITY_NOT_FOUND', 'Choose a city.');
    }
    this.assertDayRate(dto.hourlyRateAmount, dto.dailyRateAmount);
    try {
      const plan = await this.prisma.pricingPlan.create({
        data: {
          modelId: dto.modelId,
          cityId: dto.cityId ?? null,
          hourlyRateAmount: dto.hourlyRateAmount,
          dailyRateAmount: dto.dailyRateAmount ?? null,
          includedKmPerHour: dto.includedKmPerHour,
          extraKmRateAmount: dto.extraKmRateAmount,
          graceMinutes: dto.graceMinutes ?? 15,
          lateFeePerHourAmount: dto.lateFeePerHourAmount,
          depositAmount: dto.depositAmount,
        },
        include: INCLUDE,
      });
      return toPlanView(plan);
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  async update(id: string, dto: UpdatePricingPlanDto): Promise<PricingPlanView> {
    const current = await this.prisma.pricingPlan.findUnique({ where: { id } });
    if (!current) throw new AppException(404, 'PLAN_NOT_FOUND', 'Pricing plan not found.');
    this.assertDayRate(
      dto.hourlyRateAmount ?? current.hourlyRateAmount,
      dto.dailyRateAmount === undefined ? current.dailyRateAmount : dto.dailyRateAmount,
    );
    const plan = await this.prisma.pricingPlan.update({
      where: { id },
      data: {
        ...(dto.hourlyRateAmount !== undefined && { hourlyRateAmount: dto.hourlyRateAmount }),
        ...(dto.dailyRateAmount !== undefined && { dailyRateAmount: dto.dailyRateAmount }),
        ...(dto.includedKmPerHour !== undefined && { includedKmPerHour: dto.includedKmPerHour }),
        ...(dto.extraKmRateAmount !== undefined && { extraKmRateAmount: dto.extraKmRateAmount }),
        ...(dto.graceMinutes !== undefined && { graceMinutes: dto.graceMinutes }),
        ...(dto.lateFeePerHourAmount !== undefined && { lateFeePerHourAmount: dto.lateFeePerHourAmount }),
        ...(dto.depositAmount !== undefined && { depositAmount: dto.depositAmount }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: INCLUDE,
    });
    return toPlanView(plan);
  }

  /** A day rate above 24 hourly rates would never apply, which is almost certainly a typo. */
  private assertDayRate(hourly: number, daily: number | null | undefined) {
    if (daily != null && daily > hourly * 24) {
      throw new AppException(400, 'INVALID_DAY_RATE', 'The day rate cannot be more than 24 hours at the hourly rate.');
    }
  }

  private mapConflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new AppException(409, 'PLAN_EXISTS', 'This model already has a plan for that city.');
    }
    return e;
  }
}
