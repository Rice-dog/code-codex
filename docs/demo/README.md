# 90-second product demo

`CodexLiveExplorer-0.1.0-demo.mp4` is a 1920×1080, 30 fps, exactly 90-second
walkthrough of the 0.1.0 feature and security model. It is rendered entirely
from the source in `demo-video/`; it contains no Codex assets, session data, or
real workspace paths.

Rebuild it from the repository root:

```powershell
cd demo-video
npm ci
npm run lint
npx remotion render CodexLiveExplorer90 ../docs/demo/CodexLiveExplorer-0.1.0-demo.mp4 --codec h264 --crf 22 --muted
```

If Remotion cannot download its headless browser, pass a trusted local Chrome
path with `--browser-executable`.
