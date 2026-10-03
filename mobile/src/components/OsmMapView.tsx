import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

/**
 * A map that needs ZERO API key, anywhere — OpenStreetMap tiles rendered by
 * Leaflet.js inside a WebView. This exists because react-native-maps on
 * Android always requires a Google Maps SDK key (see
 * docs/google-maps-setup.md), which needs the developer's own Google Cloud
 * account; this is the fallback that works out of the box while that's
 * being set up, or permanently if you'd rather not deal with Google Cloud
 * at all. Swapping back to react-native-maps later is a drop-in change —
 * both take the same {latitude, longitude, title, pinColor} shape.
 *
 * Leaflet and its tiles load from a CDN at runtime, so the phone needs
 * internet access the first time a map screen opens (cached by the WebView
 * after that, like any web page).
 */
export interface OsmMapViewHandle {
  /** Moves the marker and re-centers without reloading the page — used for
   * live location updates, where reloading the WebView on every GPS fix
   * would reset zoom/pan and flicker. */
  setLocation: (lat: number, lon: number) => void;
}

interface Props {
  latitude: number;
  longitude: number;
  title?: string;
  pinColor?: string;
  style?: StyleProp<ViewStyle>;
}

function buildHtml({ latitude, longitude, title, pinColor }: Props) {
  const safeTitle = (title ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #161F32; }
    .leaflet-control-attribution { font-size: 9px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: true })
      .setView([${latitude}, ${longitude}], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var pinIcon = L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${pinColor ?? "#EF4444"};border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
    });
    var marker = L.marker([${latitude}, ${longitude}], { icon: pinIcon }).addTo(map);
    ${title ? `marker.bindPopup('${safeTitle}');` : ""}

    // Called from React Native via injectJavaScript to move the marker
    // live without reloading the page (see OsmMapViewHandle.setLocation).
    window.setLocation = function(lat, lon) {
      var pos = [lat, lon];
      marker.setLatLng(pos);
      map.panTo(pos, { animate: true, duration: 0.5 });
    };
  </script>
</body>
</html>`;
}

const OsmMapView = forwardRef<OsmMapViewHandle, Props>(function OsmMapView(props, ref) {
  const webviewRef = useRef<WebView>(null);
  const htmlRef = useRef(buildHtml(props));

  useImperativeHandle(ref, () => ({
    setLocation: (lat, lon) => {
      webviewRef.current?.injectJavaScript(`window.setLocation(${lat}, ${lon}); true;`);
    },
  }));

  // Keep the marker in sync if the component re-renders with new initial
  // coordinates after the page has already loaded (e.g. props change before
  // the parent has a ref to call setLocation with).
  useEffect(() => {
    webviewRef.current?.injectJavaScript(`window.setLocation && window.setLocation(${props.latitude}, ${props.longitude}); true;`);
  }, [props.latitude, props.longitude]);

  return (
    <WebView
      ref={webviewRef}
      style={props.style}
      originWhitelist={["*"]}
      source={{ html: htmlRef.current }}
      javaScriptEnabled
      domStorageEnabled
      geolocationEnabled={false}
    />
  );
});

export default OsmMapView;
