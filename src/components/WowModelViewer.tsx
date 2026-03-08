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

// Blizzard slot type → WoWHead slot ID
const SLOT_MAP: Record<string, number> = {
  head: 1, shoulder: 3, shirt: 4, chest: 5, waist: 6, legs: 7,
  feet: 8, wrist: 9, hands: 10, back: 15, main_hand: 16, off_hand: 17,
  tabard: 19,
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

  // Resolve race ID
  const resolvedRaceId = raceId || (raceName ? RACE_IDS[raceName.toLowerCase()] : undefined);
  const genderNum = gender === "FEMALE" ? 0 : 1;

  useEffect(() => {
    if (!containerRef.current || !resolvedRaceId) {
      setError("Missing race data");
      setLoading(false);
      return;
    }

    // Check if ZamModelViewer is available
    const checkViewer = () => {
      if (typeof window.ZamModelViewer !== "undefined") {
        return true;
      }
      return false;
    };

    const initViewer = () => {
      if (!containerRef.current) return;

      // Clear previous viewer
      if (viewerRef.current) {
        try { containerRef.current.innerHTML = ""; } catch {}
        viewerRef.current = null;
      }

      try {
        // Build items array from equipment
        const items = equipment
          .filter(e => e.displayId && SLOT_MAP[e.slot])
          .map(e => [SLOT_MAP[e.slot], e.displayId]);

        const viewer = new window.ZamModelViewer({
          type: 2, // character
          contentPath: "https://wow.zamimg.com/modelviewer/live/",
          container: containerRef.current,
          aspect: width / height,
          hd: true,
          models: {
            id: resolvedRaceId * 2 - 1 + (genderNum === 0 ? 1 : 0), // approximate model ID
            type: 16,
            ...(items.length > 0 ? { items } : {}),
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

    // Wait for ZamModelViewer to be available
    if (checkViewer()) {
      initViewer();
    } else {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (checkViewer()) {
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
  }, [resolvedRaceId, genderNum, width, height, JSON.stringify(equipment)]);

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
