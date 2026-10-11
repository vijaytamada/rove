import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.decorators.js';
import { CitiesService } from './cities.service.js';
import { CreateCityDto, ListCitiesQuery, UpdateCityDto } from './dto/city.dto.js';
import { RateLimit } from '../../infra/rate-limit/rate-limit.guard.js';

@ApiTags('cities')
@Controller()
export class CitiesController {
  constructor(@Inject(CitiesService) private readonly cities: CitiesService) {}

  /** Public: active cities. */
  @Public()
  @RateLimit('browse', 300, 60)
  @Get('cities')
  listPublic() {
    return this.cities.listPublic();
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  @Get('manage/cities')
  listManage(@CurrentUser() user: AuthUser, @Query() query: ListCitiesQuery) {
    return this.cities.listManage(user, query);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN')
  @Post('cities')
  create(@Body() dto: CreateCityDto) {
    return this.cities.create(dto);
  }

  @ApiBearerAuth()
  @Roles('SUPER_ADMIN')
  @Patch('cities/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCityDto) {
    return this.cities.update(id, dto);
  }
}
