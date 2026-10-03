import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.decorators.js';
import {
  CreateStaffDto,
  ListUsersQuery,
  SetAssignmentsDto,
  UpdateMeDto,
  UpdateUserDto,
} from './dto/user.dto.js';
import { toUserView, UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  // ---- Own profile (any signed-in user) ----

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.getView(user.id);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    await this.users.updateMe(user.id, dto);
    return this.users.getView(user.id);
  }

  // ---- Staff administration ----
  // Super admins manage everyone. City managers manage the station employees of their own cities
  // (the service enforces this); station employees and customers have no access.

  @Post('users')
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  async createStaff(@CurrentUser() actor: AuthUser, @Body() dto: CreateStaffDto) {
    const user = await this.users.createStaff(actor, dto);
    return this.users.getView(user.id);
  }

  @Get('users')
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  list(@CurrentUser() actor: AuthUser, @Query() query: ListUsersQuery) {
    return this.users.list(actor, query);
  }

  @Get('users/:id')
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  get(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.getForActor(actor, id);
  }

  @Patch('users/:id')
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return toUserView(await this.users.adminUpdate(actor, id, dto));
  }

  @Put('users/:id/assignments')
  @Roles('SUPER_ADMIN', 'CITY_MANAGER')
  setAssignments(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetAssignmentsDto,
  ) {
    return this.users.setAssignments(actor, id, dto.assignments);
  }
}
