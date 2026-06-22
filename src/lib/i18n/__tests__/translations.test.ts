import en from '../translations/en.json';
import sw from '../translations/sw.json';

type Tree = Record<string, unknown>;

/** All leaf keys as dotted paths, e.g. "today.scanCrop". */
function flatten(obj: Tree, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? flatten(v as Tree, key) : [key];
  });
}

// English is the baseline every other locale must match. To add a language,
// drop its <lang>.json next to en.json and add one line here — the parity
// checks (and the English fallback in index.tsx) then keep it scaling cleanly.
const locales: Record<string, Tree> = { sw: sw as Tree };
const enKeys = flatten(en as Tree).sort();

describe('i18n translation parity', () => {
  it('en has keys', () => {
    expect(enKeys.length).toBeGreaterThan(0);
  });

  for (const [name, tree] of Object.entries(locales)) {
    const keys = flatten(tree).sort();

    it(`${name}.json is not missing any en key`, () => {
      expect(enKeys.filter((k) => !keys.includes(k))).toEqual([]);
    });

    it(`${name}.json has no keys that en lacks`, () => {
      expect(keys.filter((k) => !enKeys.includes(k))).toEqual([]);
    });
  }
});
