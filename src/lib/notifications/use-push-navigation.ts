import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Routes a notification tap to the right screen. Backend push payloads carry
 * `data: { type, kind, farm_id?, journey_id? }` (see notification_service /
 * tick_engine). We prefer the farm workspace when a farm is referenced, fall
 * back to Today for the consolidated daily reminder, and otherwise open the
 * notifications inbox.
 */
type PushData = {
  type?: string;
  kind?: string;
  farm_id?: string;
  journey_id?: string;
};

function targetRoute(data: PushData | undefined): string | null {
  if (!data) {
    return null;
  }
  if (typeof data.farm_id === 'string' && data.farm_id) {
    return `/farms/${data.farm_id}`;
  }
  if (data.kind === 'daily_reminder' || data.type === 'task_reminder') {
    return '/(tabs)/today';
  }
  return '/notifications';
}

/**
 * Wire notification-tap deep links. `enabled` should be true only once the app
 * is authenticated + onboarded, so navigation doesn't fight the auth gate or
 * fire before the navigator is mounted. Uses `useLastNotificationResponse` so
 * both a cold start (app opened from a push) and a warm tap are handled, and
 * each response is acted on exactly once.
 */
export function usePushNavigation(enabled: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !response) {
      return;
    }
    const id = response.notification.request.identifier;
    if (handledId.current === id) {
      return;
    }

    const data = response.notification.request.content.data as PushData | undefined;
    const route = targetRoute(data);
    if (!route) {
      return;
    }

    handledId.current = id;
    // Defer a tick so the root navigator is mounted before we push.
    const timer = setTimeout(() => router.push(route as never), 0);
    return () => clearTimeout(timer);
  }, [enabled, response]);
}
