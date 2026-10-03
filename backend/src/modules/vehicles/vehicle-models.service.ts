import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../common/app-exception.js';
import { Prisma, type VehicleModel } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { CreateVehicleModelDto, UpdateVehicleModelDto } from './dto/vehicle.dto.js';

export interface VehicleModelView {
  id: string;
  type: 'SCOOTER';
  brand: string;
  name: string;
  rangeKm: number;
  topSpeedKmh: number;
  batteryCapacityWh: number | null;
  isActive: boolean;
}

export const toModelView = (m: VehicleModel): VehicleModelView => ({
  id: m.id,
  type: m.type,
  brand: m.brand,
  name: m.name,
  rangeKm: m.rangeKm,
  topSpeedKmh: m.topSpeedKmh,
  batteryCapacityWh: m.batteryCapacityWh,
  isActive: m.isActive,
});

/** The vehicle model catalogue is global; only super admins change it. */
@Injectable()
export class VehicleModelsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(): Promise<VehicleModelView[]> {
    const models = await this.prisma.vehicleModel.findMany({ orderBy: [{ brand: 'asc' }, { name: 'asc' }] });
    return models.map(toModelView);
  }

  async create(dto: CreateVehicleModelDto): Promise<VehicleModelView> {
    try {
      return toModelView(await this.prisma.vehicleModel.create({ data: dto }));
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  async update(id: string, dto: UpdateVehicleModelDto): Promise<VehicleModelView> {
    const found = await this.prisma.vehicleModel.findUnique({ where: { id } });
    if (!found) throw new AppException(404, 'MODEL_NOT_FOUND', 'Vehicle model not found.');
    try {
      return toModelView(await this.prisma.vehicleModel.update({ where: { id }, data: dto }));
    } catch (e) {
      throw this.mapConflict(e);
    }
  }

  private mapConflict(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new AppException(409, 'MODEL_EXISTS', 'This brand already has a model with this name.');
    }
    return e;
  }
}
