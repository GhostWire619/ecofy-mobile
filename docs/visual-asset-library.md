# Ecofy Mobile Visual Asset Library

## Art Direction

- Human imagery: authentic Tanzanian smallholder farming, natural light, editorial photography.
- Product mood: capable, calm, modern, and practical rather than playful or cartoonish.
- Brand palette: forest `#0F3D24`, Ecofy green `#1F6A3A`, leaf green, water blue, warm soil neutrals.
- UI icons: native vector symbols. Do not replace small controls with raster icons.
- Generated imagery: no embedded text, logos, watermarks, fake interfaces, or oversized objects.

## Production Assets

| Asset | Screen use | Composition | Target | Status |
| --- | --- | --- | --- | --- |
| `auth/farm-auth-hero.png` | Login and registration | Portrait photo with calm lower overlay area | 864 x 1821 or larger | Ready |
| `onboarding/welcome-farm.png` | Welcome/language selection | Wide farm landscape with people and crops | 1823 x 863 | Ready |
| `onboarding/season-plan.png` | Intro: season planning | Farmer reviewing the season in the field | 1254 x 1254 | Ready |
| `onboarding/crop-scan.png` | Intro: pest and disease scan | Phone camera inspecting a real crop leaf | 1254 x 1254 | Ready |
| `onboarding/ai-guidance.png` | Intro: local-language guidance | Farmer applying practical phone guidance | 1254 x 1254 | Ready |
| `illustrations/no-farms.png` | Empty farms state | Transparent dimensional field marker scene | 1254 x 1254 | Ready |
| `illustrations/no-notes.png` | Empty notes state | Transparent dimensional field notebook scene | 1254 x 1254 | Ready |
| `illustrations/offline-monitoring.png` | Monitoring offline state | Transparent satellite/field signal scene | 1254 x 1254 | Ready |

## Existing Reusable Assets

- `icon.png`: primary Ecofy app mark.
- `weather/*.png`: seven condition-specific dimensional weather icons.
- `android-icon-*.png`, `splash-icon.png`, and `favicon.png`: platform identity assets.

## Delivery Rules

- Keep original generated masters in PNG.
- Render photos with `expo-image` and `contentFit="cover"`.
- Render transparent illustrations with `expo-image` and `contentFit="contain"`.
- Display empty-state illustrations between 96 and 160 logical pixels.
- Use the app mark only from the existing identity files.
- Remove remaining Expo starter imagery when the new screens consume this library.
