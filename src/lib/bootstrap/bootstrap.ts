import { mobileApi } from '@/lib/api/mobile';
import {
  replaceBootstrapData,
  saveUserProfile,
  seedBootstrapDefaults,
  sessionRepository,
} from '@/lib/db/repositories';

export async function bootstrapCurrentUser() {
  await seedBootstrapDefaults();
  const payload = await mobileApi.bootstrap().catch(async () => {
    const farms = await mobileApi.listFarms();
    return {
      session: null,
      user: null as never,
      farms,
      plots: [],
      journeys: [],
      stages: [],
      milestones: [],
      tasks: [],
      logs: [],
      log_images: [],
      recommendations: [],
      weather_cache: [],
      price_snapshots: [],
    };
  });
  await replaceBootstrapData(payload);
  if (payload.user) {
    await saveUserProfile(payload.user);
    await sessionRepository.upsertSession({
      user_id: payload.user.id,
      locale: payload.user.preferred_language,
      onboarding_complete: payload.farms.length > 0 ? 1 : 0,
      last_bootstrap_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return payload;
}
