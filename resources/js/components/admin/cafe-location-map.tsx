import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, MapPin, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CafeLocationMapProps {
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
    cafeName?: string;
    onLocationChange: (lat: number, lng: number) => void;
}

const DEFAULT_FALLBACK_CENTER: [number, number] = [-6.2, 106.816666];

function createCafePinIcon(): L.DivIcon {
    return L.divIcon({
        className: 'sideline-cafe-pin-wrapper',
        html: `
            <div style="position:relative;display:flex;align-items:center;justify-content:center;width:36px;height:44px;">
                <svg viewBox="0 0 36 44" width="36" height="44" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 8px rgba(197,40,40,0.35));">
                    <path d="M18 1C8.611 1 1 8.611 1 18c0 12.1 14.52 23.45 15.96 24.53a1.75 1.75 0 0 0 2.08 0C20.48 41.45 35 30.1 35 18 35 8.611 27.389 1 18 1Z" fill="#C52828" stroke="#FFFDF9" stroke-width="2.5"/>
                    <circle cx="18" cy="17.5" r="7" fill="#FFFDF9"/>
                    <circle cx="18" cy="17.5" r="3.2" fill="#C52828"/>
                </svg>
            </div>
        `,
        iconSize: [36, 44],
        iconAnchor: [18, 42],
        popupAnchor: [0, -38],
    });
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export default function CafeLocationMap({
    latitude,
    longitude,
    radiusMeters,
    cafeName = 'Café SIDE LINE',
    onLocationChange,
}: CafeLocationMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markerRef = useRef<L.Marker | null>(null);
    const circleRef = useRef<L.Circle | null>(null);
    const onLocationChangeRef = useRef(onLocationChange);
    const initialCenterRef = useRef<[number, number]>(
        latitude !== null && longitude !== null
            ? [latitude, longitude]
            : DEFAULT_FALLBACK_CENTER,
    );
    const initialZoomRef = useRef<number>(
        latitude !== null && longitude !== null ? 17 : 12,
    );

    const [tilesOffline, setTilesOffline] = useState(false);

    useEffect(() => {
        onLocationChangeRef.current = onLocationChange;
    }, [onLocationChange]);

    // Inisialisasi instance Leaflet satu kali (StrictMode safe)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const map = L.map(el, {
            center: initialCenterRef.current,
            zoom: initialZoomRef.current,
            zoomControl: true,
        });

        const tileLayer = L.tileLayer(
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors',
            },
        );

        let consecutiveTileErrors = 0;
        tileLayer.on('tileload', () => {
            consecutiveTileErrors = 0;
            setTilesOffline(false);
        });
        tileLayer.on('tileerror', () => {
            consecutiveTileErrors += 1;
            if (consecutiveTileErrors >= 3) {
                setTilesOffline(true);
            }
        });

        tileLayer.addTo(map);

        map.on('click', (event: L.LeafletMouseEvent) => {
            const lat = Number(event.latlng.lat.toFixed(6));
            const lng = Number(event.latlng.lng.toFixed(6));
            onLocationChangeRef.current(lat, lng);
        });

        mapRef.current = map;

        return () => {
            markerRef.current = null;
            circleRef.current = null;
            mapRef.current = null;
            map.remove();
        };
    }, []);

    // Sinkronisasi pin kafe dan lingkaran radius setiap koordinat / radius berubah
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        if (
            latitude === null ||
            longitude === null ||
            Number.isNaN(latitude) ||
            Number.isNaN(longitude)
        ) {
            if (markerRef.current) {
                markerRef.current.remove();
                markerRef.current = null;
            }
            if (circleRef.current) {
                circleRef.current.remove();
                circleRef.current = null;
            }
            return;
        }

        const position: L.LatLngExpression = [latitude, longitude];
        const safeRadius = Math.max(10, radiusMeters);
        const safeName = escapeHtml(cafeName || 'Café SIDE LINE');

        if (!markerRef.current) {
            const marker = L.marker(position, {
                draggable: true,
                icon: createCafePinIcon(),
            }).addTo(map);

            marker.on('dragend', () => {
                const moved = marker.getLatLng();
                onLocationChangeRef.current(
                    Number(moved.lat.toFixed(6)),
                    Number(moved.lng.toFixed(6)),
                );
            });

            markerRef.current = marker;
        } else {
            markerRef.current.setLatLng(position);
        }

        markerRef.current.bindTooltip(
            `<div style="font-weight:700;font-size:11px;color:#18181B;">${safeName}</div><div style="font-size:10px;color:#78716C;">Radius akses: ${safeRadius} m</div>`,
            { direction: 'top', offset: [0, -36] },
        );

        if (!circleRef.current) {
            circleRef.current = L.circle(position, {
                radius: safeRadius,
                color: '#C52828',
                weight: 2,
                dashArray: '6 5',
                fillColor: '#C52828',
                fillOpacity: 0.14,
            }).addTo(map);
        } else {
            circleRef.current.setLatLng(position);
            circleRef.current.setRadius(safeRadius);
        }

        const currentCenter = map.getCenter();
        const distanceMoved = map.distance(currentCenter, position);
        if (distanceMoved > 40) {
            const targetZoom =
                safeRadius >= 2000
                    ? 13
                    : safeRadius >= 600
                      ? 15
                      : safeRadius >= 200
                        ? 16
                        : 17;
            map.setView(position, Math.max(map.getZoom(), targetZoom), {
                animate: true,
            });
        }
    }, [latitude, longitude, radiusMeters, cafeName]);

    const handleCenterToPin = () => {
        const map = mapRef.current;
        if (!map || latitude === null || longitude === null) return;

        if (circleRef.current) {
            map.fitBounds(circleRef.current.getBounds(), {
                padding: [36, 36],
                maxZoom: 18,
            });
        } else {
            map.setView([latitude, longitude], 17, { animate: true });
        }
    };

    const hasCoordinates =
        latitude !== null &&
        longitude !== null &&
        !Number.isNaN(latitude) &&
        !Number.isNaN(longitude);

    return (
        <div className="relative isolate overflow-hidden rounded-2xl border border-[#E8DFC8] bg-[#FAF6EC]">
            <div
                ref={containerRef}
                className="z-0 h-[340px] w-full sm:h-[420px]"
            />

            {/* Petunjuk di atas peta */}
            <div className="pointer-events-none absolute top-3 right-3 left-14 z-10 flex flex-wrap items-start justify-between gap-2">
                <div className="pointer-events-auto inline-flex items-center gap-2 rounded-xl border border-[#E8DFC8] bg-[#FFFDF9]/95 px-3 py-1.5 text-xs font-semibold text-[#18181B] shadow-sm backdrop-blur-xs">
                    <MapPin className="size-3.5 shrink-0 text-[#C52828]" />
                    <span>
                        {hasCoordinates
                            ? 'Klik peta atau geser pin merah untuk memindahkan titik kafe'
                            : 'Klik di peta untuk menentukan titik lokasi kafe'}
                    </span>
                </div>

                {hasCoordinates && (
                    <button
                        type="button"
                        onClick={handleCenterToPin}
                        className="pointer-events-auto inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[#DFCFA9] bg-[#FFFDF9]/95 px-3 py-1.5 text-xs font-bold text-[#5B4126] shadow-sm transition hover:border-[#C52828] hover:text-[#C52828]"
                    >
                        <LocateFixed className="size-3.5" />
                        Fokus ke Radius
                    </button>
                )}
            </div>

            {/* Fallback jika tile peta gagal dimuat (misalnya mode offline) */}
            {tilesOffline && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FEF3C7]/95 px-3.5 py-2.5 text-xs font-semibold text-[#92400E] shadow-sm">
                    <WifiOff className="size-4 shrink-0" />
                    <span>
                        Tile peta OpenStreetMap tidak dapat dimuat (jaringan
                        offline/terbatas). Koordinat dan radius tetap aktif
                        serta bisa diatur melalui kolom di sebelah kanan.
                    </span>
                </div>
            )}
        </div>
    );
}
