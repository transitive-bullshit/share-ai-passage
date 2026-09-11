# Social card backgrounds

These five Midjourney selections are stored locally as optimized, progressive JPEGs. Each image is 1200 × 630 pixels, encoded at quality 85 with metadata removed. The original PNGs are not part of the repository.

| Template | Selected variant | Original job |
| --- | --- | --- |
| Margin notes | A | [570864b5](https://www.midjourney.com/jobs/570864b5-5c97-4450-8682-7525ab37907b?index=0) |
| Electric risograph | A | [826a740b](https://www.midjourney.com/jobs/826a740b-75be-42c5-b84c-7ec4ae894577?index=0) |
| Maker’s workbench | D | [e88b673b](https://www.midjourney.com/jobs/e88b673b-d256-46d1-8d3b-332c7d3ad430?index=3) |
| Midnight observatory | A | [ef6bf9da](https://www.midjourney.com/jobs/ef6bf9da-aad9-4c5d-ae4a-da01171b01e1?index=0) |
| Friendly lab | A | [a9ec32aa](https://www.midjourney.com/jobs/a9ec32aa-2c1f-4c33-a8c4-66f6876b6d4c?index=0) |

`lib/social-templates.ts` owns each template’s typography, layout, colors, and background path. Fontsource packages supply the embedded fonts; `pnpm fonts:prepare` also copies their licenses into the generated font directory. `next.config.ts` explicitly includes the JPEGs and fonts in server output traces, so social cards require no external asset requests.

Equivalent ImageMagick optimization for a source image:

```sh
magick source.png -auto-orient -resize '1200x630^' -gravity center -extent 1200x630 -strip -sampling-factor 4:2:0 -interlace Plane -quality 85 background.jpg
```
