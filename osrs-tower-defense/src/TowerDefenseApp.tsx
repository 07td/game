import React, { useEffect, useState } from 'react';
import { MapViewer } from '@rs-map-viewer/mapviewer/MapViewer';
import { MapViewerContainer } from '@rs-map-viewer/mapviewer/MapViewerContainer';
import { CacheInfo } from '@rs-map-viewer/rs/cache/CacheInfo';

export function TowerDefenseApp(): JSX.Element {
  const [mapViewer, setMapViewer] = useState<MapViewer | null>(null);

  useEffect(() => {
    const viewer = new MapViewer();
    
    // Load the latest OSRS cache
    fetch('/caches/caches.json')
      .then(response => response.json())
      .then((caches: { osrs: CacheInfo[] }) => {
        const latestCache = caches.osrs[0]; // Assuming first is latest
        return viewer.loadCache(latestCache);
      })
      .then(() => {
        setMapViewer(viewer);
      })
      .catch(error => {
        console.error('Failed to load cache:', error);
      });

    return () => {
      // Cleanup if needed
    };
  }, []);

  if (!mapViewer) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading OSRS Tower Defense...
      </div>
    );
  }

  return <MapViewerContainer mapViewer={mapViewer} />;
}