"use client";

// One calm light map per target city. Each map is fit to its own city's pins at zoom 11-12. Pins are 10px ink
// dots with a white ring that take the outcome colour once decided; names show on hover only.
// Positions are city level (a deterministic spread around the city centre) unless an office address was geocoded.
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useRef } from "react";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import { layoutAroundCity } from "../radar/geo";

export interface Pin {
  key: string;
  name: string;
  city: string;
  color: string;
  /** [lng, lat] of a geocoded office address; otherwise the city-level layout position is used. */
  exact?: [number, number];
}

interface Props {
  token: string;
  city: string;
  center: { lat: number; lng: number };
  pins: Pin[];
  hovered: string | null;
  onHover: (key: string | null) => void;
  /** A pin was clicked: open that company. */
  onPick: (key: string) => void;
  onFail: (why: string) => void;
}

export const MIN_ZOOM = 11;
export const MAX_ZOOM = 12;

type Placed = { pin: Pin; pos: [number, number]; side: "left" | "right" };

function place(pins: Pin[], center: Props["center"]): Placed[] {
  const laid = layoutAroundCity(pins.map((p) => p.key), center);
  return pins.map((p) => {
    const l = laid.get(p.key)!;
    return { pin: p, pos: p.exact ?? l.pos, side: l.side };
  });
}

export function CityMap({ token, city, center, pins, hovered, onHover, onPick, onFail }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const libRef = useRef<typeof import("mapbox-gl") | null>(null);
  const ready = useRef(false);
  const framed = useRef("");
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLDivElement }>());
  const latest = useRef({ pins, hovered });
  latest.current = { pins, hovered };
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  /** Fit to this city's pins, never wider than zoom 11 nor closer than 12. Only when the set of pins changes. */
  const frame = (placed: Placed[], duration: number) => {
    const map = mapRef.current;
    const keys = placed.map((p) => p.pin.key).sort().join("|");
    if (!map || keys === framed.current) return;
    framed.current = keys;
    const pts = [[center.lng, center.lat] as [number, number], ...placed.map((p) => p.pos)];
    const lng = pts.map((p) => p[0]);
    const lat = pts.map((p) => p[1]);
    const cam = map.cameraForBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 56, maxZoom: MAX_ZOOM });
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam?.zoom ?? MIN_ZOOM));
    map.easeTo({ center: cam?.center ?? [center.lng, center.lat], zoom, duration });
  };

  const sync = () => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready.current) return;
    const placed = place(latest.current.pins, center);
    const seen = new Set<string>();
    for (const { pin, pos, side } of placed) {
      seen.add(pin.key);
      let m = markers.current.get(pin.key);
      if (!m) {
        const el = document.createElement("div");
        el.innerHTML = `<span class="a-pin-dot"></span><span class="a-pin-label"></span>`;
        el.addEventListener("mouseenter", () => onHoverRef.current(pin.key));
        el.addEventListener("mouseleave", () => onHoverRef.current(null));
        el.addEventListener("click", () => onPickRef.current(pin.key));
        m = { marker: new lib.default.Marker({ element: el }).setLngLat(pos).addTo(map), el };
        markers.current.set(pin.key, m);
      }
      m.marker.setLngLat(pos);
      // Toggle our classes only: mapbox's own marker class must stay (it positions the element).
      m.el.classList.add("a-pin");
      m.el.classList.toggle("left", side === "left");
      m.el.classList.toggle("hl", latest.current.hovered === pin.key);
      m.el.style.setProperty("--c", pin.color);
      m.el.title = `${pin.name} · ${pin.exact ? "office address" : "approximate location: city level"}`;
      (m.el.querySelector(".a-pin-label") as HTMLSpanElement).textContent = pin.name;
    }
    for (const [k, m] of markers.current) {
      if (!seen.has(k)) {
        m.marker.remove();
        markers.current.delete(k);
      }
    }
    frame(placed, framed.current ? 600 : 0);
  };

  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    const timer = setTimeout(() => !loaded && onFail("map did not load in time"), 10_000);
    (async () => {
      try {
        const lib = await import("mapbox-gl");
        if (cancelled || !box.current) return;
        lib.default.accessToken = token;
        const map = new lib.default.Map({
          container: box.current,
          style: "mapbox://styles/mapbox/light-v11",
          projection: "mercator",
          center: [center.lng, center.lat],
          zoom: MIN_ZOOM,
          minZoom: 3,
          attributionControl: true,
          cooperativeGestures: true,
        });
        libRef.current = lib;
        mapRef.current = map;
        map.on("error", (e) => !loaded && onFail((e.error as Error | undefined)?.message ?? "map error"));
        map.on("load", () => {
          loaded = true;
          ready.current = true;
          map.resize();
          sync();
        });
      } catch (err) {
        onFail((err as Error).message);
      }
    })();
    const m = markers.current;
    return () => {
      cancelled = true;
      clearTimeout(timer);
      ready.current = false;
      framed.current = "";
      m.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // One map per token and city; pins and hover are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, city]);

  useEffect(sync, [pins, hovered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <figure className="a-citymap">
      <div ref={box} className="a-map" aria-label={`Map of the companies found in ${city}`} />
      <figcaption className="a-maplabel">
        {city} <span className="a-num">· {pins.length}</span>
      </figcaption>
    </figure>
  );
}
