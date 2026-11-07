import { useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { buyerMapIcon, sellerMapIcon } from "../../utils/mapConfig";

// Map layers for the admin user map (Phase 8): screen-space clustering,
// a density heatmap, and a legend. No extra map library: clustering is a
// grid bucket at the current zoom, which is enough for the user counts this
// map shows and keeps the bundle as it was.

const CLUSTER_CELL_PX = 60;
const HEAT_CELL_MULTIPLIER = 2; // heat cells are twice as coarse, so density reads as blobs
const COLORS = { cluster: "#1f2937", heat: "#E4572E", buyer: "#7C5CFC", seller: "#0F7A6C" };

// Degrees per grid cell at a zoom level (256px world tiles).
function cellSizeDeg(zoom, multiplier = 1) {
    return (CLUSTER_CELL_PX * multiplier * 360) / (256 * Math.pow(2, zoom));
}

// Buckets points into grid cells. Each bucket reports its count, centroid,
// and buyer/seller/online breakdown so the cluster icon and popup can use them.
export function clusterPoints(markers, zoom, multiplier = 1) {
    const cell = cellSizeDeg(zoom, multiplier);
    const buckets = new Map();
    for (const m of markers) {
        const key = `${Math.floor(m.lat / cell)}:${Math.floor(m.lng / cell)}`;
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { key, members: [], sumLat: 0, sumLng: 0 };
            buckets.set(key, bucket);
        }
        bucket.members.push(m);
        bucket.sumLat += m.lat;
        bucket.sumLng += m.lng;
    }
    return [...buckets.values()].map((b) => {
        const count = b.members.length;
        return {
            key: b.key,
            count,
            lat: b.sumLat / count,
            lng: b.sumLng / count,
            members: b.members,
            sellers: b.members.filter((m) => m.role === "seller").length,
            buyers: count - b.members.filter((m) => m.role === "seller").length,
            online: b.members.filter((m) => m.isOnline).length
        };
    });
}

// Tracks the map's zoom so clusters re-bucket after a zoom change.
function useMapZoom() {
    const map = useMap();
    const [zoom, setZoom] = useState(() => map.getZoom());
    useMapEvents({
        zoomend: () => setZoom(map.getZoom())
    });
    return zoom;
}

function clusterIcon(count) {
    const size = Math.min(56, 28 + Math.round(Math.sqrt(count) * 4));
    return new L.DivIcon({
        className: "",
        html: `<div style="background:${COLORS.cluster};color:#fff;width:${size}px;height:${size}px;border-radius:999px;border:3px solid white;box-shadow:0 0 0 2px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;font:600 12px/1 system-ui,sans-serif">${count}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
    });
}

// Individual markers, or numbered bubbles when several users share a
// screen-sized area. Clicking a bubble zooms in on it.
export function ClusteredMarkers({ markers }) {
    const map = useMap();
    const zoom = useMapZoom();
    const clusters = useMemo(() => clusterPoints(markers, zoom), [markers, zoom]);

    return clusters.map((c) => {
        if (c.count === 1) {
            const m = c.members[0];
            return (
                <Marker key={m.key} position={[m.lat, m.lng]} icon={m.role === "seller" ? sellerMapIcon : buyerMapIcon}>
                    <Popup>
                        <div className="text-sm">
                            <div className="font-semibold">{m.name}</div>
                            <div className="text-ash capitalize">{m.role} {m.isOnline ? "• online now" : ""}</div>
                        </div>
                    </Popup>
                </Marker>
            );
        }
        return (
            <Marker
                key={`cluster-${c.key}`}
                position={[c.lat, c.lng]}
                icon={clusterIcon(c.count)}
                eventHandlers={{
                    click: () => map.setView([c.lat, c.lng], Math.min(zoom + 2, 17))
                }}
                title={`${c.count} users here. Click to zoom in.`}
            />
        );
    });
}

// Density heatmap: coarse cells sized and shaded by how many users fall in
// them. Built from the same bucketing as the clusters, so the two views
// agree on where people are.
export function HeatLayer({ markers }) {
    const zoom = useMapZoom();
    const cells = useMemo(() => clusterPoints(markers, zoom, HEAT_CELL_MULTIPLIER), [markers, zoom]);
    const max = cells.reduce((m, c) => Math.max(m, c.count), 0) || 1;

    return cells.map((c) => {
        const intensity = c.count / max;
        return (
            <CircleMarker
                key={`heat-${c.key}`}
                center={[c.lat, c.lng]}
                radius={14 + Math.round(intensity * 26)}
                pathOptions={{
                    color: COLORS.heat,
                    weight: 0,
                    fillColor: COLORS.heat,
                    fillOpacity: 0.2 + intensity * 0.5
                }}
            >
                <Popup>
                    <div className="text-sm">
                        <div className="font-semibold">{c.count} user{c.count === 1 ? "" : "s"} in this area</div>
                        <div className="text-ash">{c.buyers} buyer{c.buyers === 1 ? "" : "s"} · {c.sellers} seller{c.sellers === 1 ? "" : "s"}</div>
                    </div>
                </Popup>
            </CircleMarker>
        );
    });
}

// Legend shown above the map. The heat scale only appears in heatmap mode,
// since that is the only mode where its colours mean anything.
export function MapLegend({ mode }) {
    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ash" aria-label="Map legend">
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS.buyer }} aria-hidden="true" />
                Buyer
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: COLORS.seller }} aria-hidden="true" />
                Seller
            </span>
            <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS.cluster }} aria-hidden="true" />
                Users in an area (click to zoom)
            </span>
            {mode === "heat" && (
                <span className="flex items-center gap-2">
                    <span>Density</span>
                    <span
                        className="inline-block w-24 h-2.5 rounded-full"
                        style={{ background: `linear-gradient(to right, rgba(228,87,46,0.2), rgba(228,87,46,0.9))` }}
                        aria-hidden="true"
                    />
                    <span>few → many</span>
                </span>
            )}
        </div>
    );
}
