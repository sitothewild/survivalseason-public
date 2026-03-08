// @ts-nocheck
import { useEffect, useRef, useState } from "react";

// WoWHead race name → race ID mapping
const RACE_IDS: Record<string, number> = {
  human: 1, orc: 2, dwarf: 3, "night elf": 4, undead: 5, tauren: 6,
  gnome: 7, troll: 8, goblin: 9, "blood elf": 10, draenei: 11,
  worgen: 22, pandaren: 24, nightborne: 27, "highmountain tauren": 28,
  "void elf": 29, "lightforged draenei": 30, "zandalari troll": 31,
  "kul tiran": 32, "dark iron dwarf": 34, vulpera: 35, "mag'har orc": 36,
  mechagnome: 37, dracthyr: 52, earthen: 85,
};

interface WowModelViewerProps {
  raceId?: number;
  raceName?: string;
  gender?: string; // "MALE" or "FEMALE"
  equipment?: { slot: string; displayId?: number }[];
  width?: number;
  height?: number;
}

export default function WowModelViewer({
  raceId,
  raceName,
  gender = "MALE",
  equipment = [],
  width = 220,
  height = 280,
}: WowModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const resolvedRaceId = raceId || (raceName ? RACE_IDS[raceName.toLowerCase()] : undefined);
  const genderNum = gender === "FEMALE" ? 0 : 1;

  useEffect(() => {
    if (!containerRef.current || !resolvedRaceId) {
      setError("Missing race data");
      setLoading(false);
      return;
    }

    const initViewer = () => {
      if (!containerRef.current) return;
      if (typeof window.ZamModelViewer === "undefined" || typeof window.jQuery === "undefined") {
        setError("3D viewer scripts not loaded");
        setLoading(false);
        return;
      }

      // Clear previous
      if (viewerRef.current) {
        try { containerRef.current.innerHTML = ""; } catch {}
        viewerRef.current = null;
      }

      try {
        // ZamModelViewer expects a jQuery element as container
        const $container = window.jQuery(containerRef.current);

        const viewer = new window.ZamModelViewer({
          type: 2, // character type
          contentPath: "https://wow.zamimg.com/modelviewer/live/",
          container: $container,
          aspect: width / height,
          hd: true,
          models: {
            id: resolvedRaceId,
            type: 16, // character
            gender: genderNum,
          },
        });

        viewerRef.current = viewer;
        setLoading(false);
        setError("");
      } catch (e) {
        console.error("WoWHead viewer init error:", e);
        setError("Failed to load 3D viewer");
        setLoading(false);
      }
    };

    // Wait for scripts
    if (typeof window.ZamModelViewer !== "undefined") {
      initViewer();
    } else {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof window.ZamModelViewer !== "undefined") {
          clearInterval(interval);
          initViewer();
        } else if (attempts > 50) {
          clearInterval(interval);
          setError("3D viewer scripts not loaded");
          setLoading(false);
        }
      }, 200);
      return () => clearInterval(interval);
    }

    return () => {
      if (viewerRef.current) {
        try { if (containerRef.current) containerRef.current.innerHTML = ""; } catch {}
        viewerRef.current = null;
      }
    };
  }, [resolvedRaceId, genderNum, width, height]);

  return (
    <div style={{ width, height, position: "relative", borderRadius: 8, overflow: "hidden", background: "#080c06" }}>
      {loading && !error && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#7a6040", fontFamily: "'EB Garamond', serif", fontSize: 12, zIndex: 2,
        }}>
          Loading 3D model...
        </div>
      )}
      {error && (
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          color: "#7a4040", fontFamily: "'EB Garamond', serif", fontSize: 11, padding: 12, textAlign: "center", zIndex: 2,
        }}>
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", cursor: "grab" }}
      />
    </div>
  );
}
