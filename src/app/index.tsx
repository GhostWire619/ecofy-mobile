import { ActivityIndicator, View } from 'react-native';

import { theme } from '@/lib/theme';

export default function IndexScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
      }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}
