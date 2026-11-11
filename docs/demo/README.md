# Demo media

- `prospect-decision-radar.mp4`: 1920×1080, H.264, ~80 s, recorded from the saved example (replay only, no provider
  calls) with lower-third captions following [DEMO.md](../../DEMO.md).
- `steps-2-to-3.gif`: 12 s, steps 2 → 3 (the list settling, then the cards flying into their columns).

Re-create (a dev or production server on `BASE_URL`, the public Mapbox token set at build time for the maps):

```bash
BASE_URL=http://localhost:3000 pnpm tsx scripts/record-demo.ts --out docs/demo/raw
ffmpeg -ss 0.4 -i docs/demo/raw/<file>.webm -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -movflags +faststart -an docs/demo/prospect-decision-radar.mp4
ffmpeg -ss 28 -t 12 -i docs/demo/prospect-decision-radar.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" docs/demo/steps-2-to-3.gif
```

Record on a real GPU: with software WebGL the screencast drops the frames of the card flight.
