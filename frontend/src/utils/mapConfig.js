import L from "leaflet";

// react-leaflet's default marker icon references image paths that Vite's
// bundler doesn't resolve correctly, so markers silently fail to render.
// Pointing at the CDN copies is the standard workaround.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

// Dar es Salaam city center — sensible default map center for a
// Tanzania-focused marketplace when we don't have a location yet.
export const DEFAULT_CENTER = [-6.7924, 39.2083];

export const agentIcon = new L.DivIcon({
    className: "",
    html: `<div style="background:#F5A623;width:16px;height:16px;border-radius:999px;border:3px solid white;box-shadow:0 0 0 2px rgba(0,0,0,0.15)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

export const destinationIcon = new L.DivIcon({
    className: "",
    html: `<div style="background:#0F7A6C;width:16px;height:16px;border-radius:999px;border:3px solid white;box-shadow:0 0 0 2px rgba(0,0,0,0.15)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});
