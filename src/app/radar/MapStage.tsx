"use client";

// Mapbox GL hero. Every movement is driven by real run state (discovery events, stages, in-flight
// decisions). Positions are city-level only: profile cityCoordinates + a small offset seeded by name.
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { Profile } from "../../core/types";
import { approxPosition } from "./geo";
import { blipState, sectorOf } from "./geometry";
import type { DiscoveryLine, Row } from "./reducer";

type Coords = NonNullable<Profile["cityCoordinates"]>;

interface MapStageProps {
  token: string;
  cities: string[];
  coords: Coords;
  rows: Row[];
  discovery: DiscoveryLine[];
  status: "idle" | "running" | "finished" | "failed" | "interrupted";
  threshold: number;
  selected: number | null;
  onSelect: (index: number) => void;
  onFail: (reason: string) => void;
}

const LOAD_TIMEOUT_MS = 10_000;
const TOUR_STEP_MS = 3200;

// Keeps the idle globe clear of the hero card on wide screens.
const idlePadding = () => ({ top: 0, bottom: 0, left: 0, right: typeof window !== "undefined" && window.innerWidth > 1100 ? 520 : 0 });
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MapStage({ token, cities, coords, rows, discovery, status, threshold, selected, onSelect, onFail }: MapStageProps) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const libRef = useRef<typeof import("mapbox-gl") | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLDivElement }>());
  const toured = useRef<string[]>([]);
  const tourTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const spin = useRef(true);
  const statusRef = useRef(status);
  statusRef.current = status;
  const lastStatus = useRef<string>("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const timeout = setTimeout(() => !loaded && onFail("map did not load in time"), LOAD_TIMEOUT_MS);
    (async () => {
      try {
        const lib = await import("mapbox-gl");
        if (cancelled || !box.current) return;
        const mapboxgl = lib.default;
        mapboxgl.accessToken = token;
        const first = coords[cities[0] ?? ""];
        const map = new mapboxgl.Map({
          container: box.current,
          style: "mapbox://styles/mapbox/dark-v11",
          projection: "globe",
          center: first ? [first.lng, (first.lat + (coords[cities[1] ?? ""]?.lat ?? first.lat)) / 2] : [0, 20],
          zoom: 1.4,
          attributionControl: true,
        });
        libRef.current = lib;
        mapRef.current = map;
        map.on("error", (e) => {
          if (!loaded) onFail(`map error: ${(e.error as Error | undefined)?.message ?? "unknown"}`);
        });
        map.on("load", () => {
          loaded = true;
          if (statusRef.current === "idle") map.setPadding(idlePadding());
          map.setFog({ color: "#0b1222", "high-color": "#13234a", "horizon-blend": 0.08, "space-color": "#04060d", "star-intensity": 0.35 });
          // One glowing label per profile city.
          for (const city of cities) {
            const c = coords[city];
            if (!c) continue;
            const el = document.createElement("div");
            el.className = "city-label";
            el.textContent = city.toUpperCase();
            new mapboxgl.Marker({ element: el, anchor: "bottom", offset: [0, -14] }).setLngLat([c.lng, c.lat]).addTo(map);
          }
          rotate();
        });
        // Idle rotation (Mapbox "spin the globe" pattern): ease a few degrees, repeat on moveend.
        const rotate = () => {
          if (!spin.current || reducedMotion() || map.isMoving()) return;
          const ctr = map.getCenter();
          map.easeTo({ center: [ctr.lng - 6, ctr.lat], duration: 1000, easing: (t) => t });
        };
        map.on("moveend", rotate);
        map.on("mousedown", () => (spin.current = false));
      } catch (err) {
        onFail(`map failed: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      clearTimeout(tourTimer.current);
      markers.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once per token/profile; other props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, cities.join("|")]);

  // Keep the canvas sized to its container (idle hero -> live panel).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Camera: spin while idle; fly to each city as its discovery starts; fit all cities at the end.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const entered = lastStatus.current !== status;
    lastStatus.current = status;
    if (status === "idle") {
      toured.current = [];
      spin.current = true;
      if (entered) map.easeTo({ zoom: 1.4, padding: idlePadding(), duration: 800 });
      return;
    }
    spin.current = false;
    // Padding goes inside each camera call: a separate setPadding would stop the animation in flight.
    const order = [...new Set(discovery.map((d) => d.city).filter((c): c is string => !!c && !!coords[c]))];
    const pending = order.filter((c) => !toured.current.includes(c));
    const flyNext = () => {
      tourTimer.current = undefined;
      const next = order.find((c) => !toured.current.includes(c));
      if (!next || !mapRef.current) return;
      toured.current = [...toured.current, next];
      const c = coords[next]!;
      mapRef.current.flyTo({ center: [c.lng, c.lat], zoom: 10, padding: NO_PADDING, speed: 1.4, curve: 1.6, essential: false });
      if (order.some((x) => !toured.current.includes(x))) tourTimer.current = setTimeout(flyNext, TOUR_STEP_MS);
    };
    if (pending.length && !tourTimer.current) flyNext();
    if (entered && (status === "finished" || status === "failed")) {
      clearTimeout(tourTimer.current);
      tourTimer.current = undefined;
      const pts = cities.map((c) => coords[c]).filter(Boolean) as Array<{ lat: number; lng: number }>;
      if (pts.length && libRef.current) {
        const b = new libRef.current.default.LngLatBounds();
        pts.forEach((p) => b.extend([p.lng, p.lat]));
        map.fitBounds(b, { padding: { top: 80, bottom: 80, left: 80, right: 80 }, duration: 2200, maxZoom: 9 });
      }
    }
    return () => {
      if (status !== "running") {
        clearTimeout(tourTimer.current);
        tourTimer.current = undefined;
      }
    };
  }, [discovery, status, cities, coords]);

  // Markers: one per company in a profile city, coloured by stage, pulsing while a decision is in flight.
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib) return;
    const seen = new Set<string>();
    for (const row of rows) {
      const name = row.result.company.name;
      const sector = sectorOf(row.result.company.city, cities);
      const c = coords[cities[sector] ?? ""];
      if (!c) continue; // outside the profile cities: shown on the board only
      const key = `${row.index}-${name}`;
      seen.add(key);
      const { tone } = blipState(row, threshold);
      let m = markers.current.get(key);
      if (!m) {
        const el = document.createElement("div");
        el.innerHTML = `<span class="ring"></span><span class="core"></span><span class="tag"></span>`;
        el.addEventListener("click", () => onSelectRef.current(row.index));
        const marker = new lib.default.Marker({ element: el }).setLngLat(approxPosition(name, c)).addTo(map);
        m = { marker, el };
        markers.current.set(key, m);
      }
      const fixture = row.result.company.discoveredBy === "fixture";
      // A geocoded office address (from enrichment) moves the pin there and makes it solid.
      const loc = row.result.enrichment?.location;
      m.marker.setLngLat(loc ? [loc.lng, loc.lat] : approxPosition(name, c));
      m.el.classList.toggle("exact", !!loc);
      // Toggle our classes only: replacing className would drop mapbox's "mapboxgl-marker" (position: absolute)
      // and the markers would stack in normal flow, hundreds of km away from their position.
      for (const cls of [...m.el.classList]) if (cls.startsWith("tone-")) m.el.classList.remove(cls);
      m.el.classList.add("map-blip", `tone-${tone}`);
      m.el.classList.toggle("fixture", fixture);
      m.el.classList.toggle("sel", selected === row.index);
      m.el.title = `${name} · ${row.result.company.city ?? ""} · ${loc ? "office address (geocoded)" : "approximate: city level"}`;
      (m.el.querySelector(".tag") as HTMLSpanElement).textContent = name;
    }
    for (const [key, m] of markers.current) {
      if (!seen.has(key)) {
        m.marker.remove();
        markers.current.delete(key);
      }
    }
  }, [rows, threshold, selected, cities, coords]);

  return <div ref={box} className="mapstage" aria-label={`Map of ${cities.join(" and ")}`} />;
}
