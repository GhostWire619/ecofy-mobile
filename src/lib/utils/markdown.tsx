import { Platform, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import { theme } from '@/lib/theme';

/**
 * Minimal Markdown renderer for assistant replies.
 *
 * The AI returns Markdown (headings, **bold**, bullet/numbered lists). Rendering
 * it as raw text shows literal `**`, `#`, `-` markers, which looks broken. This
 * component covers the constructs the model actually emits — headings, bold,
 * italic, inline `code`, and bullet/numbered lists — without pulling in a native
 * Markdown dependency. Anything it doesn't recognise renders as a plain
 * paragraph, so it degrades gracefully.
 */

type InlineToken = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

// Split a line into styled spans for **bold**, __bold__, *italic*, _italic_, `code`.
function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const push = (t: string, opts: Omit<InlineToken, 'text'> = {}) => {
    if (t) tokens.push({ text: t, ...opts });
  };
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index));
    if (m[2] != null) push(m[2], { bold: true });
    else if (m[4] != null) push(m[4], { italic: true });
    else if (m[5] != null) push(m[5], { code: true });
    last = re.lastIndex;
  }
  push(text.slice(last));
  return tokens.length ? tokens : [{ text }];
}

function Inline({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  return (
    <Text style={style}>
      {parseInline(text).map((t, i) => (
        <Text
          key={i}
          style={[
            t.bold && styles.bold,
            t.italic && styles.italic,
            t.code && styles.code,
          ]}
        >
          {t.text}
        </Text>
      ))}
    </Text>
  );
}

export function MarkdownText({
  content,
  color,
  size = 15,
}: {
  content: string;
  color?: string;
  size?: number;
}) {
  const textColor = color ?? theme.colors.text;
  const base: TextStyle = { color: textColor, fontSize: size, lineHeight: Math.round(size * 1.45) };
  const lines = (content ?? '').replace(/\r\n/g, '\n').split('\n');

  return (
    <View style={styles.container}>
      {lines.map((raw, idx) => {
        const line = raw.trim();
        if (!line) return <View key={idx} style={styles.spacer} />;

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          return (
            <Inline
              key={idx}
              text={heading[2]}
              style={[base, styles.heading, { fontSize: size + 2 }]}
            />
          );
        }

        const bullet = line.match(/^[-*•]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={idx} style={styles.listRow}>
              <Text style={[base, styles.marker]}>•</Text>
              <Inline text={bullet[1]} style={[base, styles.listText]} />
            </View>
          );
        }

        const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <View key={idx} style={styles.listRow}>
              <Text style={[base, styles.marker]}>{numbered[1]}.</Text>
              <Inline text={numbered[2]} style={[base, styles.listText]} />
            </View>
          );
        }

        return <Inline key={idx} text={line} style={base} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 3 },
  spacer: { height: 6 },
  heading: { fontWeight: '800' },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.primaryDark,
  },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  marker: { fontWeight: '700' },
  listText: { flex: 1 },
});
