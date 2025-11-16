# Agentic Video Creator

A browser-native storyboard tool for crafting slide-based stories and exporting them as shareable WebM clips. Build scenes, preview the animation instantly on canvas, and capture the output using the MediaRecorder API — no server required.

## ✨ Features

- Slide-by-slide editor with titles, narration, background color, and duration controls
- Real-time canvas preview rendered at 1280×720
- Timeline visualizer summarizing scene durations
- WebM export via `canvas.captureStream` and `MediaRecorder`
- One-click download with automatic cleanup of prior renders

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` to start building your video.

## 🧱 Tech Stack

- Next.js 14 (App Router)
- React 18 with client-only canvas rendering
- Vanilla CSS for minimal dependencies

## 📦 Production Build

```bash
npm run build
npm run start
```

The production bundle is optimized for Vercel deployments.

## 📘 Notes

- Media capture relies on browser support for `MediaRecorder` (Chrome, Edge, Firefox).
- Exports are encoded as VP8/VP9 WebM files and can be transcoded with FFmpeg if needed.
