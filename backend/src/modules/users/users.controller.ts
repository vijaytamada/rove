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

  // ---- User administration (super admin only in Phase 2) ----
  // City managers creating employees for their own cities arrives with stations in Phase 3.

  @Post('users')
  @Roles('SUPER_ADMIN')
  async createStaff(@Body() dto: CreateStaffDto) {
    const user = await this.users.createStaff(dto);
    return this.users.getView(user.id);
  }

  @Get('users')
  @Roles('SUPER_ADMIN')
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get('users/:id')
  @Roles('SUPER_ADMIN')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.getView(id);
  }

  @Patch('users/:id')
  @Roles('SUPER_ADMIN')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return toUserView(await this.users.adminUpdate(actor, id, dto));
  }

  @Put('users/:id/assignments')
  @Roles('SUPER_ADMIN')
  setAssignments(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetAssignmentsDto) {
    return this.users.setAssignments(id, dto.assignments);
  }
}
