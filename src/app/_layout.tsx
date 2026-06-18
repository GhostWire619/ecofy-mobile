import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { XpGainProvider } from '@/components/game';
import { AuthProvider, useAuth } from '@/lib/auth/provider';
import { farmRepository, INTRO_SEEN_KEY, prefsRepository } from '@/lib/db/repositories';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { registerPushNotifications } from '@/lib/notifications/register';
import { SyncProvider } from '@/lib/sync/provider';
import { theme } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

function NavigationGate() {
  const { isReady, isAuthenticated, onboardingComplete, markOnboardingComplete, user } = useAuth();
  const { isReady: i18nReady, locale } = useI18n();
  const segments = useSegments();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!isReady || !i18nReady) {
      return;
    }

    SplashScreen.hideAsync().catch(() => undefined);

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inIntro = segments[0] === 'intro';

    if (!isAuthenticated) {
      // Already on a pre-auth screen (intro or login/register) — let it be, so
      // the user can move intro → register/login without the gate bouncing them.
      if (inIntro || inAuth) {
        return;
      }
      // First install (intro not yet seen) → show the hero carousel; otherwise
      // go straight to sign in. Read the flag fresh each time.
      prefsRepository
        .get(INTRO_SEEN_KEY)
        .then((seen) => router.replace(seen === '1' ? '/(auth)/login' : '/intro'))
        .catch(() => router.replace('/(auth)/login'));
      return;
    }

    if (isAuthenticated && !onboardingComplete && !inOnboarding) {
      // If the user already has farms locally, skip onboarding and go home
      farmRepository.listFarms().then((farms) => {
        if (farms.length > 0) {
          markOnboardingComplete().catch(() => undefined);
          router.replace('/(tabs)/today' as never);
        } else {
          router.replace('/(onboarding)/welcome');
        }
      }).catch(() => {
        router.replace('/(onboarding)/welcome');
      });
      return;
    }

    // Authenticated + onboarded: leave any pre-app screen (auth, onboarding,
    // intro) AND the initial '/index' landing route — otherwise the app sits on
    // the index spinner forever (the gate only routed in from auth/onboarding).
    const seg0 = (segments as readonly string[])[0];
    const onLanding = !seg0 || seg0 === 'index';
    if (isAuthenticated && onboardingComplete && (inAuth || inOnboarding || inIntro || onLanding)) {
      router.replace('/(tabs)/today' as never);
    }
  }, [i18nReady, isAuthenticated, isReady, markOnboardingComplete, onboardingComplete, segments]);

  useEffect(() => {
    if (!user || !isAuthenticated || !i18nReady) {
      return;
    }

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      registerPushNotifications(locale).catch(() => undefined);
    }
  }, [i18nReady, isAuthenticated, locale, user]);

  if (!isReady || !i18nReady) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="intro" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="assistant"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="notes/[logId]"
        options={{
          title: 'Note',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          title: 'Settings',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="scan"
        options={{
          title: 'Scan crop',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="farms/[farmId]"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
        }}
      />
      <Stack.Screen
        name="farms-map/[farmId]"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="farms/new"
        options={{
          title: 'Add farm',
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <AuthProvider>
              <SyncProvider>
                <XpGainProvider>
                  <StatusBar style="dark" />
                  <NavigationGate />
                </XpGainProvider>
              </SyncProvider>
            </AuthProvider>
          </I18nProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
