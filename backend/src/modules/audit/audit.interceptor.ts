import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { mergeMap } from 'rxjs';
import type { AuthUser } from '../../common/auth.decorators.js';
import { describeRequest, pickSafeFields, routeWithoutPrefix } from './audit-describe.js';
import { AuditService } from './audit.service.js';

interface AuditedRequest {
  method: string;
  route?: { path?: string };
  params?: Record<string, string | undefined>;
  body?: unknown;
  user?: AuthUser;
}

/**
 * Records every successful write made by a staff, manager or admin account (customers' own actions are already in the
 * booking, payment and refund tables). Because it hangs on the request, a new endpoint is audited without anyone
 * remembering to add a line. It never keeps a request body, only the route, the ids and a short allow-list of safe values.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<AuditedRequest>();
    const user = req.user;
    const route = req.route?.path;
    if (!user || user.role === 'CUSTOMER' || !route) return next.handle();
    const draft = describeRequest(req.method, route);
    if (!draft) return next.handle();

    return next.handle().pipe(
      // Only a call that succeeded is recorded; the response is read for the id of something just created. The entry is
      // written before the response goes out, so a caller who got a success can already find it in the trail.
      mergeMap(async (response) => {
        const created = draft.entityFromResponse && response && typeof response === 'object' ? (response as { id?: unknown }).id : undefined;
        await this.audit.record({
          actorId: user.id,
          actorRole: user.role,
          action: draft.action,
          entityType: draft.entityType,
          entityId: req.params?.id ?? (typeof created === 'string' ? created : null),
          route: `${req.method.toUpperCase()} ${routeWithoutPrefix(route)}`,
          details: pickSafeFields(req.body, draft.safeBodyFields),
        });
        return response;
      }),
    );
  }
}
