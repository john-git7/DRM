import { useEffect, useMemo, useState } from 'react';

/**
 * Visible per-session forensic watermark.
 *
 * Because no mobile browser can block OS-level screen recording (iOS Control
 * Center, Android system recorder) and the analog hole defeats any on-device
 * block anyway, the realistic defence is traceability: burn the viewer's identity
 * onto every rendered frame so a leaked clip — even one screen-recorded, re-encoded,
 * or filmed off the screen with another phone — points back to a single account,
 * device, IP, and moment in time.
 *
 * Two layers, both captured by any recorder painting the page:
 *  1. A faint full-frame tiled, rotated identity pattern. Covering the entire
 *     frame makes it crop-resistant — there is no clean corner to cut away.
 *  2. A slightly more legible chip carrying a live, ticking timestamp that drifts
 *     slowly to a new position every few seconds, so it cannot be predicted and
 *     masked, and it proves *when* the capture happened.
 *
 * Everything here is non-interactive, unselectable, and aria-hidden so it never
 * affects accessibility or input — it exists only to be photographed.
 */

interface ForensicOverlayProps {
  /** Viewer identity (username from the JWT, or a fallback label). */
  identity: string;
  /** Caller IP as observed by the server (returned with the key grant). */
  ip?: string;
  /** Device fingerprint bound to this session. */
  deviceId: string;
}

/** Opacity of the all-over tiled pattern — faint enough not to spoil viewing,
 *  dense enough to survive heavy re-compression. */
const TILE_OPACITY = 0.08;
/** Opacity of the drifting live-timestamp chip. */
const CHIP_OPACITY = 0.22;
/** How often the chip jumps to a fresh position (ms). The CSS transition below
 *  stretches the move so it reads as a slow glide, not a teleport. */
const DRIFT_INTERVAL_MS = 6000;

export default function ForensicOverlay({ identity, ip, deviceId }: ForensicOverlayProps) {
  const deviceShort = deviceId ? deviceId.slice(0, 10) : 'nodevice';
  const label = `${identity || 'viewer'} · ${ip || 'ip?'} · ${deviceShort}`;

  // Live, ticking clock (UTC, second resolution) for the drifting chip.
  const [now, setNow] = useState(() => new Date().toISOString().replace('T', ' ').slice(0, 19));
  useEffect(() => {
    const t = setInterval(
      () => setNow(new Date().toISOString().replace('T', ' ').slice(0, 19)),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  // Drifting position for the chip, refreshed on an interval.
  const [pos, setPos] = useState({ top: 12, left: 14 });
  useEffect(() => {
    const move = () =>
      setPos({
        top: 6 + Math.floor(Math.random() * 80), // 6–86%
        left: 6 + Math.floor(Math.random() * 70), // 6–76%
      });
    move();
    const t = setInterval(move, DRIFT_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  // Tiled background: an inline SVG, rotated, repeated across the whole frame.
  // Rebuilt only when the identity label changes (not every clock tick).
  const tileUrl = useMemo(() => {
    const text = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='340' height='170'>` +
      `<text x='0' y='90' transform='rotate(-28 170 85)' ` +
      `font-family='monospace' font-size='15' fill='white' fill-opacity='${TILE_OPACITY}'>` +
      `${text}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }, [label]);

  return (
    <div className="absolute inset-0 z-25 overflow-hidden pointer-events-none select-none" aria-hidden>
      {/* Layer 1 — all-over tiled identity, crop-resistant. */}
      <div
        className="absolute inset-0"
        style={{ backgroundImage: tileUrl, backgroundRepeat: 'repeat', mixBlendMode: 'difference' }}
      />
      {/* Layer 2 — drifting, live-ticking chip. */}
      <div
        className="absolute font-mono whitespace-nowrap"
        style={{
          top: `${pos.top}%`,
          left: `${pos.left}%`,
          opacity: CHIP_OPACITY,
          fontSize: '12px',
          color: '#fff',
          textShadow: '0 0 2px rgba(0,0,0,0.6)',
          mixBlendMode: 'difference',
          transition: `top ${DRIFT_INTERVAL_MS - 500}ms linear, left ${DRIFT_INTERVAL_MS - 500}ms linear`,
        }}
      >
        {label} · {now}Z
      </div>
    </div>
  );
}
