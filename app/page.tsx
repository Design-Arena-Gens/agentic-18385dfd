"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Slide = {
  id: string;
  title: string;
  body: string;
  background: string;
  duration: number;
};

type TimelineSegment = {
  id: string;
  durationMs: number;
};

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const createSlide = (index: number): Slide => ({
  id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `slide-${index}`,
  title: `Slide ${index + 1}`,
  body: "Describe your story here.",
  background: ["#5b21b6", "#1d4ed8", "#059669", "#dc2626"][index % 4],
  duration: 4
});

const INITIAL_SLIDES: Slide[] = [createSlide(0), createSlide(1)];

export default function HomePage() {
  const [slides, setSlides] = useState<Slide[]>(INITIAL_SLIDES);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>();
  const playingRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const timeline = useMemo(() => {
    const segments: TimelineSegment[] = slides.map((slide) => ({
      id: slide.id,
      durationMs: Math.max(1, Math.round(slide.duration * 1000))
    }));
    const totalDurationMs = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
    return {
      segments,
      totalDurationMs: Math.max(totalDurationMs, 1)
    };
  }, [slides]);

  const drawSlide = useCallback(
    (ctx: CanvasRenderingContext2D, slide: Slide, localProgress: number) => {
      ctx.save();
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = slide.background || "#1f2937";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const padding = 120;
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(padding, padding, CANVAS_WIDTH - padding * 2, CANVAS_HEIGHT - padding * 2);

      ctx.fillStyle = "#f8fafc";
      ctx.shadowColor = "rgba(15, 23, 42, 0.4)";
      ctx.shadowBlur = 12;
      ctx.font = "bold 64px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(slide.title, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);

      ctx.shadowBlur = 0;
      ctx.font = "28px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
      wrapText(ctx, slide.body, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30, CANVAS_WIDTH - padding * 2 - 80, 40);

      // Simple progress indicator at the bottom
      ctx.fillStyle = "rgba(226, 232, 240, 0.25)";
      const indicatorWidth = CANVAS_WIDTH - padding * 2;
      const indicatorHeight = 14;
      const indicatorX = padding;
      const indicatorY = CANVAS_HEIGHT - padding + 40;
      ctx.fillRect(indicatorX, indicatorY, indicatorWidth, indicatorHeight);
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(indicatorX, indicatorY, indicatorWidth * Math.min(Math.max(localProgress, 0), 1), indicatorHeight);

      ctx.restore();
    },
    []
  );

  const drawFrame = useCallback(
    (elapsedMs: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx || slides.length === 0) {
        return;
      }

      const clamped = Math.max(0, Math.min(elapsedMs, timeline.totalDurationMs - 1));
      let remaining = clamped;
      let activeIndex = 0;
      let currentSegment = timeline.segments[0];

      for (let i = 0; i < timeline.segments.length; i += 1) {
        const segment = timeline.segments[i];
        if (remaining <= segment.durationMs || i === timeline.segments.length - 1) {
          activeIndex = i;
          currentSegment = segment;
          break;
        }
        remaining -= segment.durationMs;
      }

      const slide = slides[activeIndex];
      const progress = currentSegment.durationMs === 0 ? 0 : remaining / currentSegment.durationMs;
      drawSlide(ctx, slide, progress);
    },
    [drawSlide, slides, timeline]
  );

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    setIsPlaying(false);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  }, []);

  const runTimeline = useCallback(
    (loop: boolean, onComplete?: () => void) => {
      if (slides.length === 0) {
        return;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      let start = performance.now();
      playingRef.current = true;
      setIsPlaying(true);

      const tick = (now: number) => {
        if (!playingRef.current) {
          return;
        }
        const elapsed = now - start;
        if (elapsed >= timeline.totalDurationMs) {
          drawFrame(timeline.totalDurationMs - 1);
          if (loop) {
            start = now;
            animationRef.current = requestAnimationFrame(tick);
          } else {
            playingRef.current = false;
            setIsPlaying(false);
            onComplete?.();
          }
          return;
        }
        drawFrame(elapsed);
        animationRef.current = requestAnimationFrame(tick);
      };

      drawFrame(0);
      animationRef.current = requestAnimationFrame(tick);
    },
    [drawFrame, slides.length, timeline.totalDurationMs]
  );

  const playPreview = useCallback(() => {
    runTimeline(true);
  }, [runTimeline]);

  const stopPreview = useCallback(() => {
    stopPlayback();
  }, [stopPlayback]);

  useEffect(() => {
    drawFrame(0);
    return () => {
      stopPlayback();
      recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, [drawFrame, stopPlayback]);

  useEffect(
    () => () => {
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
      }
    },
    [recordedUrl]
  );

  const addSlide = useCallback(() => {
    setSlides((prev) => [...prev, createSlide(prev.length)]);
  }, []);

  const updateSlide = useCallback((id: string, patch: Partial<Slide>) => {
    setSlides((prev) => prev.map((slide) => (slide.id === id ? { ...slide, ...patch } : slide)));
  }, []);

  const removeSlide = useCallback((id: string) => {
    setSlides((prev) => (prev.length <= 1 ? prev : prev.filter((slide) => slide.id !== id)));
  }, []);

  const moveSlide = useCallback((id: string, direction: -1 | 1) => {
    setSlides((prev) => {
      const index = prev.findIndex((slide) => slide.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) {
        return prev;
      }
      const updated = [...prev];
      const [removed] = updated.splice(index, 1);
      updated.splice(target, 0, removed);
      return updated;
    });
  }, []);

  const downloadRecording = useCallback(() => {
    if (!recordedUrl) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = recordedUrl;
    anchor.download = "storyboard.webm";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [recordedUrl]);

  const selectMimeType = useCallback(() => {
    if (typeof MediaRecorder === "undefined") {
      return undefined;
    }
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return candidates.find((candidate) => {
      try {
        return MediaRecorder.isTypeSupported(candidate);
      } catch {
        return false;
      }
    });
  }, []);

  const renderVideo = useCallback(() => {
    if (slides.length === 0 || isRecording) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      setStatusMessage("Canvas preview is not ready.");
      return;
    }
    const stream = canvas.captureStream(30);
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    const mimeType = selectMimeType();

    try {
      recordedChunksRef.current = [];
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType ?? "video/webm" });
        if (recordedUrl) {
          URL.revokeObjectURL(recordedUrl);
        }
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setIsRecording(false);
        setStatusMessage("Video rendering complete. Ready for download.");
        recorder.stream.getTracks().forEach((track) => track.stop());
      };

      setIsRecording(true);
      setStatusMessage("Rendering video...");
      recorder.start(200);

      const start = performance.now();
      playingRef.current = true;
      const tick = (now: number) => {
        if (!playingRef.current) {
          return;
        }
        const elapsed = now - start;
        if (elapsed >= timeline.totalDurationMs) {
          drawFrame(timeline.totalDurationMs - 1);
          playingRef.current = false;
          setIsPlaying(false);
          recorder.stop();
          return;
        }
        drawFrame(elapsed);
        animationRef.current = requestAnimationFrame(tick);
      };

      setIsPlaying(true);
      drawFrame(0);
      animationRef.current = requestAnimationFrame(tick);
    } catch (error) {
      setStatusMessage("MediaRecorder is not supported in this browser.");
      stream.getTracks().forEach((track) => track.stop());
      playingRef.current = false;
      setIsPlaying(false);
      setIsRecording(false);
    }
  }, [drawFrame, isRecording, recordedUrl, selectMimeType, slides.length, timeline.totalDurationMs]);

  const resetRecording = useCallback(() => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }
    setRecordedUrl(null);
  }, [recordedUrl]);

  const totalDuration = useMemo(
    () => slides.reduce((sum, slide) => sum + slide.duration, 0),
    [slides]
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 20px 80px",
        color: "#f8fafc"
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "32px"
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            textAlign: "center"
          }}
        >
          <span style={{ color: "rgba(148, 163, 184, 0.9)", fontSize: "14px", letterSpacing: "0.08em" }}>
            STORYBOARD TO VIDEO
          </span>
          <h1
            style={{
              fontSize: "40px",
              margin: 0,
              letterSpacing: "-0.02em"
            }}
          >
            Turn quick story ideas into animated clips
          </h1>
          <p style={{ color: "rgba(148, 163, 184, 0.95)", maxWidth: "640px", margin: "0 auto" }}>
            Craft slide-by-slide narratives, preview them instantly, and export a ready-to-share WebM video — all in your browser.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 420px) minmax(0, 1fr)",
            gap: "24px",
            alignItems: "flex-start"
          }}
        >
          <div
            style={{
              background: "rgba(15, 23, 42, 0.65)",
              backdropFilter: "blur(18px)",
              borderRadius: "24px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              border: "1px solid rgba(148, 163, 184, 0.2)"
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <h2 style={{ margin: 0, fontSize: "20px" }}>Slides</h2>
              <span style={{ color: "rgba(148, 163, 184, 0.85)", fontSize: "14px" }}>
                Arrange your story beats and control timing for each scene.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  style={{
                    borderRadius: "18px",
                    padding: "18px",
                    background: "rgba(30, 41, 59, 0.65)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: "16px" }}>Scene {index + 1}</strong>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        disabled={index === 0}
                        onClick={() => moveSlide(slide.id, -1)}
                        style={controlButtonStyle(index === 0)}
                      >
                        ↑
                      </button>
                      <button
                        disabled={index === slides.length - 1}
                        onClick={() => moveSlide(slide.id, 1)}
                        style={controlButtonStyle(index === slides.length - 1)}
                      >
                        ↓
                      </button>
                      <button
                        disabled={slides.length === 1}
                        onClick={() => removeSlide(slide.id)}
                        style={controlButtonStyle(slides.length === 1)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Headline</span>
                    <input
                      value={slide.title}
                      onChange={(event) => updateSlide(slide.id, { title: event.target.value })}
                      style={inputStyle}
                      placeholder="Impact title"
                      maxLength={60}
                    />
                  </label>

                  <label style={labelStyle}>
                    <span style={labelTextStyle}>Narration</span>
                    <textarea
                      value={slide.body}
                      onChange={(event) => updateSlide(slide.id, { body: event.target.value })}
                      style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }}
                      placeholder="Supporting details and call-to-action"
                      maxLength={260}
                    />
                  </label>

                  <div style={{ display: "flex", gap: "12px" }}>
                    <label style={{ ...labelStyle, flex: "1" }}>
                      <span style={labelTextStyle}>Duration (s)</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={slide.duration}
                        onChange={(event) =>
                          updateSlide(slide.id, { duration: Math.max(1, Number(event.target.value) || 1) })
                        }
                        style={inputStyle}
                      />
                    </label>
                    <label style={{ ...labelStyle, width: "120px" }}>
                      <span style={labelTextStyle}>Backdrop</span>
                      <input
                        type="color"
                        value={slide.background}
                        onChange={(event) => updateSlide(slide.id, { background: event.target.value })}
                        style={{
                          width: "100%",
                          height: "44px",
                          borderRadius: "12px",
                          border: "1px solid rgba(148, 163, 184, 0.25)",
                          padding: "0 8px",
                          cursor: "pointer",
                          background: "rgba(15, 23, 42, 0.4)"
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addSlide}
              style={{
                marginTop: "8px",
                borderRadius: "16px",
                padding: "14px 18px",
                border: "1px dashed rgba(96, 165, 250, 0.5)",
                background: "rgba(37, 99, 235, 0.12)",
                color: "#bfdbfe",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              + Add another scene
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px"
            }}
          >
            <div
              style={{
                position: "relative",
                borderRadius: "28px",
                overflow: "hidden",
                background: "rgba(15, 23, 42, 0.7)",
                border: "1px solid rgba(148, 163, 184, 0.25)"
              }}
            >
              <canvas
                ref={canvasRef}
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block"
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: "16px",
                  left: "16px",
                  padding: "6px 12px",
                  borderRadius: "999px",
                  background: "rgba(15, 23, 42, 0.65)",
                  color: "rgba(226, 232, 240, 0.8)",
                  fontSize: "13px",
                  letterSpacing: "0.08em"
                }}
              >
                LIVE PREVIEW
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px"
              }}
            >
              <button
                disabled={isRecording}
                onClick={isPlaying ? stopPreview : playPreview}
                style={primaryButtonStyle(isPlaying, isRecording)}
              >
                {isPlaying ? "Stop Preview" : "Play Preview"}
              </button>
              <button
                onClick={renderVideo}
                disabled={isRecording}
                style={secondaryButtonStyle(isRecording)}
              >
                {isRecording ? "Rendering…" : "Render Video"}
              </button>
              <button
                onClick={downloadRecording}
                disabled={!recordedUrl}
                style={secondaryButtonStyle(!recordedUrl)}
              >
                Download Render
              </button>
              <button
                onClick={resetRecording}
                disabled={!recordedUrl}
                style={ghostButtonStyle(!recordedUrl)}
              >
                Reset
              </button>
            </div>

            <div
              style={{
                borderRadius: "20px",
                padding: "18px 22px",
                background: "rgba(15, 23, 42, 0.5)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px" }}>
                <span>Total runtime</span>
                <strong>{totalDuration.toFixed(1)} seconds</strong>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                {slides.map((slide) => (
                  <div
                    key={slide.id}
                    title={`${slide.title} — ${slide.duration}s`}
                    style={{
                      flex: slide.duration,
                      height: "10px",
                      borderRadius: "999px",
                      background: slide.background,
                      transition: "flex 0.3s ease"
                    }}
                  />
                ))}
              </div>
              {statusMessage ? (
                <span style={{ color: "rgba(125, 211, 252, 0.9)", fontSize: "14px" }}>{statusMessage}</span>
              ) : (
                <span style={{ color: "rgba(148, 163, 184, 0.75)", fontSize: "14px" }}>
                  Render exports as WebM, perfect for quick shares or post-production tweaks.
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

const controlButtonStyle = (disabled: boolean): React.CSSProperties => ({
  width: "34px",
  height: "34px",
  borderRadius: "10px",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  background: disabled ? "rgba(30, 41, 59, 0.35)" : "rgba(15, 23, 42, 0.6)",
  color: "rgba(226, 232, 240, 0.85)",
  cursor: disabled ? "not-allowed" : "pointer",
  display: "grid",
  placeItems: "center",
  fontSize: "16px"
});

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px"
};

const labelTextStyle: React.CSSProperties = {
  fontSize: "13px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "rgba(148, 163, 184, 0.8)"
};

const inputStyle: React.CSSProperties = {
  borderRadius: "12px",
  padding: "12px 14px",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  background: "rgba(15, 23, 42, 0.4)",
  color: "#e2e8f0",
  fontSize: "15px",
  outline: "none",
  transition: "border-color 0.2s ease",
  boxShadow: "inset 0 0 0 1px rgba(30, 64, 175, 0)"
};

const primaryButtonStyle = (active: boolean, disabled?: boolean): React.CSSProperties => ({
  borderRadius: "16px",
  padding: "14px 24px",
  border: "none",
  background: disabled
    ? "rgba(30, 41, 59, 0.4)"
    : active
    ? "rgba(239, 68, 68, 0.85)"
    : "linear-gradient(135deg, #2563eb, #38bdf8)",
  color: "#f8fafc",
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
  boxShadow: active
    ? "0 12px 24px rgba(239, 68, 68, 0.25)"
    : "0 12px 24px rgba(37, 99, 235, 0.25)",
  transition: "all 0.2s ease"
});

const secondaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  borderRadius: "16px",
  padding: "14px 22px",
  border: "1px solid rgba(125, 211, 252, 0.35)",
  background: disabled ? "rgba(15, 23, 42, 0.4)" : "rgba(8, 47, 73, 0.7)",
  color: "rgba(125, 211, 252, 0.95)",
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "all 0.2s ease"
});

const ghostButtonStyle = (disabled: boolean): React.CSSProperties => ({
  borderRadius: "16px",
  padding: "14px 22px",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  background: "transparent",
  color: "rgba(226, 232, 240, 0.8)",
  fontWeight: 500,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.4 : 1,
  transition: "opacity 0.2s ease"
});

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;

  for (let index = 0; index < words.length; index += 1) {
    const testLine = `${line}${words[index]} `;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && index > 0) {
      ctx.fillText(line.trim(), x, lineY);
      line = `${words[index]} `;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, lineY);
}
