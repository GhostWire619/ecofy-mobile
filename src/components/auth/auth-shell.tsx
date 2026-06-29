import { Image, type ImageSource } from 'expo-image';
import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/lib/theme';

const ECOFY_MARK = require('../../../assets/images/android-icon-foreground.png');

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  image: ImageSource;
  compact?: boolean;
};

export function AuthShell({
  title,
  subtitle,
  children,
  image,
  compact = false,
}: AuthShellProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.hero, compact && styles.heroCompact]}>
          <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.heroShade} />
          <View style={[styles.brandRow, { paddingTop: Math.max(insets.top, 12) }]}>
            <View style={styles.markWrap}>
              <Image source={ECOFY_MARK} style={styles.mark} contentFit="contain" />
            </View>
            <Text style={styles.brand}>ECOFY</Text>
          </View>
          <Animated.View
            entering={FadeInUp.duration(320)}
            style={styles.heroCopy}
          >
            <Text style={styles.heroEyebrow}>FARM WITH CLARITY</Text>
            <Text style={styles.heroLine}>Better decisions, from field to harvest.</Text>
          </Animated.View>
        </View>

        <Animated.View
          entering={FadeInDown.duration(360).delay(80)}
          style={[styles.panel, compact && styles.panelCompact]}
        >
          <View style={styles.heading}>
            <Text selectable style={styles.title}>{title}</Text>
            <Text selectable style={styles.subtitle}>{subtitle}</Text>
          </View>
          {children}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthDivider({ label = 'or continue with' }: { label?: string }) {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.divider} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.primaryDark,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: theme.colors.background,
  },
  hero: {
    height: 286,
    overflow: 'hidden',
    backgroundColor: theme.colors.primaryDark,
  },
  heroCompact: {
    height: 226,
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 28, 16, 0.30)',
  },
  brandRow: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  markWrap: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  mark: {
    width: 25,
    height: 25,
  },
  brand: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  heroCopy: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 42,
    gap: 5,
  },
  heroEyebrow: {
    color: '#d9efb6',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.7,
  },
  heroLine: {
    maxWidth: 290,
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
  },
  panel: {
    flexGrow: 1,
    marginTop: -24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.background,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 24,
    gap: 14,
  },
  panelCompact: {
    paddingTop: 20,
    gap: 12,
  },
  heading: {
    gap: 4,
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    maxWidth: 350,
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 1,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
