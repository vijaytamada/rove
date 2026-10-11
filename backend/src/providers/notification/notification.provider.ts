export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

/** A message for one customer. The in-app copy is stored by NotificationsService; the provider only delivers outside the app. */
export interface OutgoingNotification {
  userId: string;
  /** E.164 phone number, null if the user has none. */
  phone: string | null;
  title: string;
  body: string;
}

/**
 * Delivery outside the app (SMS, push, email). The mock only logs. A real SMS sender arrives with Phase 9 (it needs India DLT
 * template registration), so the in-app inbox is the channel that always works.
 */
export interface NotificationProvider {
  readonly name: string;
  deliver(message: OutgoingNotification): Promise<void>;
}
