import { Platform } from 'react-native';

export const theme = {
  colors: {
    background: '#f3f4ee',
    surface: '#ffffff',
    surfaceMuted: '#eef4eb',
    card: '#f7f8f3',
    text: '#142318',
    textMuted: '#58705f',
    border: '#d7e2d6',
    primary: '#1f6a3a',
    primaryDark: '#0f3d24',
    accent: '#f2b746',
    info: '#2a6fd6',
    success: '#267c4a',
    warning: '#d88a1b',
    danger: '#c55234',
    disabled: '#a9b8aa',
    overlay: 'rgba(10, 23, 14, 0.42)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    pill: 999,
  },
  shadow: Platform.select({
    ios: {
      shadowColor: '#0d1f15',
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 4,
    },
    default: {},
  }),
} as const;

export type AppTheme = typeof theme;
