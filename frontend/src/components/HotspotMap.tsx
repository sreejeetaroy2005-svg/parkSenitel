import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, LayersControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Hotspot, Station } from '../types/index';
import { cisToColor, cisToRadius } from '../utils/colors';
import { useAppContext } from '../context/AppContext';

// ---------------------------------------------------------------------------
// Sub-component: auto-fit map to station bounding box
// ---------------------------------------------------------------------------
interface MapFitterProps {
  station: Station | null;
}

function MapFitter({ station }: MapFitterProps): null {
  const map = useMap();
  useEffect(() => {
    if (!station) return;
    const { min_lat, max_lat, min_lon, max_lon } = station.bbox;
    // Add a small padding so hotspots on the edge are not cut off
    map.fitBounds(
      [
        [min_lat - 0.005, min_lon - 0.005],
        [max_lat + 0.005, max_lon + 0.005],
      ],
      { animate: true, duration: 0.8 }
    );
  }, [station, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Main map component
// ---------------------------------------------------------------------------
interface HotspotMapProps {
  hotspots: Hotspot[];
}

/**
 * Full-screen Leaflet map with CartoDB Positron basemap.
 * Each hotspot is rendered as a CircleMarker scaled and coloured by CIS.
 * Clicking a marker selects the hotspot (shows detail panel).
 */
export function HotspotMap({ hotspots }: HotspotMapProps): React.JSX.Element {
  const { state, dispatch } = useAppContext();
  const { selectedStation, selectedHotspot } = state;
  const mapRef = useRef<L.Map | null>(null);

  const handleMarkerClick = (hotspot: Hotspot) => {
    dispatch({
      type: 'SELECT_HOTSPOT',
      payload: selectedHotspot?.h3_index === hotspot.h3_index ? null : hotspot,
    });
  };

  return (
    <MapContainer
      center={[13.0827, 80.2707]}   // Chennai default
      zoom={12}
      className="w-full h-full"
      ref={mapRef}
      zoomControl={true}
      attributionControl={true}
    >
      {/* Map Layers Control */}
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Dark Mode">
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_matter/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            maxZoom={19}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Street Map (Google-style)">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />
        </LayersControl.BaseLayer>

        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {/* Auto-fit to selected station */}
      <MapFitter station={selectedStation} />

      {/* Hotspot markers */}
      {hotspots.map((hotspot) => {
        const color = cisToColor(hotspot.cis_normalized);
        const radius = cisToRadius(hotspot.cis_normalized);
        const isSelected = selectedHotspot?.h3_index === hotspot.h3_index;

        return (
          <CircleMarker
            key={hotspot.h3_index}
            center={[hotspot.latitude, hotspot.longitude]}
            radius={isSelected ? radius + 4 : radius}
            pathOptions={{
              fillColor: color,
              fillOpacity: isSelected ? 0.95 : 0.75,
              color: isSelected ? '#F5F0E8' : color,
              weight: isSelected ? 2.5 : 1,
            }}
            eventHandlers={{
              click: () => handleMarkerClick(hotspot),
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -radius]}
              opacity={0.95}
              className="hotspot-tooltip"
            >
              <div className="text-xs font-body">
                <div className="font-semibold text-primary-text">
                  {hotspot.sample_address ?? `${hotspot.latitude.toFixed(4)}, ${hotspot.longitude.toFixed(4)}`}
                </div>
                <div className="text-secondary-text mt-0.5">
                  {hotspot.violation_count} violations · CIS {hotspot.cis_normalized.toFixed(0)}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
