// @ts-nocheck
import { useEffect, useRef, useState } from "react";

interface CharacterModelViewerProps {
  renderUrl?: string; // Blizzard character render URL (main-raw or main)
  fallbackUrl?: string; // avatar URL as fallback
  width?: number;
  height?: number;
}

export default function WowModelViewer({
  renderUrl,
  fallbackUrl,
  width = 200,
  height = 260,
}: CharacterModelViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(0);
  const rotationStart = useRef(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [error, setError] = useState("");
  const imgRef = useRef<HTMLImageElement | null>(null);
  const animFrame = useRef<number>(0);

  const imgUrl = renderUrl || fallbackUrl;

  // Load the character render image
  useEffect(() => {
    if (!imgUrl) {
      setError("No character image available");
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
      setError("");
    };
    img.onerror = () => {
      setError("Failed to load character image");
    };
    img.src = imgUrl;
  }, [imgUrl]);

  // Draw on canvas with perspective transform
  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, width, height);

      const img = imgRef.current!;
      const angle = (rotation % 360) * (Math.PI / 180);

      // Calculate perspective scale based on rotation
      const scaleX = Math.cos(angle);
      const absScale = Math.abs(scaleX);

      // Determine if showing front or back
      const isFront = Math.abs(((rotation % 360) + 360) % 360) <= 90 || Math.abs(((rotation % 360) + 360) % 360) >= 270;

      // Draw character image with horizontal scaling for 3D effect
      const imgAspect = img.width / img.height;
      const drawHeight = height * 0.95;
      const drawWidth = drawHeight * imgAspect;
      const centerX = width / 2;
      const centerY = height / 2;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(scaleX, 1);

      if (isFront) {
        // Draw the actual character image
        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
      } else {
        // Draw silhouette for back view
        ctx.globalAlpha = 0.6;
        ctx.drawImage(img, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "#1a2a18";
        ctx.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      // Subtle shadow/glow effect
      const gradient = ctx.createRadialGradient(centerX, height - 10, 0, centerX, height - 10, width * 0.4);
      gradient.addColorStop(0, "rgba(30, 80, 30, 0.3)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, height - 30, width, 30);
    };

    draw();
  }, [imageLoaded, rotation, width, height]);

  // Mouse/touch drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStart.current = e.clientX;
    rotationStart.current = rotation;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = e.clientX - dragStart.current;
    setRotation(rotationStart.current + delta * 0.8);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  if (!imgUrl) {
    return (
      <div style={{
        width, height, borderRadius: 8, background: "#080c06",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#7a6040", fontFamily: "'EB Garamond', serif", fontSize: 11,
      }}>
        No character render
      </div>
    );
  }

  return (
    <div
      style={{
        width, height, position: "relative", borderRadius: 8, overflow: "hidden",
        background: "radial-gradient(ellipse at center, #0f1a0e 0%, #060a05 100%)",
        border: "1px solid #1e3018",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {!imageLoaded && !error && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#7a6040", fontFamily: "'EB Garamond', serif", fontSize: 12,
        }}>
          Loading...
        </div>
      )}
      {error && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#7a4040", fontFamily: "'EB Garamond', serif", fontSize: 11, padding: 12, textAlign: "center",
        }}>
          {error}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: imageLoaded ? "block" : "none" }}
      />
      {imageLoaded && (
        <div style={{
          position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center",
          fontFamily: "'EB Garamond', serif", fontSize: 9, color: "#4a6040", opacity: 0.7,
          pointerEvents: "none",
        }}>
          ↔ Drag to rotate
        </div>
      )}
    </div>
  );
}
