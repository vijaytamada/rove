import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../../common/auth.decorators.js';
import { ListNotificationsQuery } from './dto/notification.dto.js';
import { NotificationsService } from './notifications.service.js';

/** The signed-in user's own messages. Nobody can read or change anyone else's. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListNotificationsQuery) {
    return this.notifications.list(user, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user, id);
  }
}
