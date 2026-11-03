// The one 3D object on the landing page: a 5x5 risk heat map as floating tiles. Each tile's height is its risk score
// (likelihood x impact), so the tall ones in the corner are the dangerous ones. Critical tiles (score 20 and up) are the
// accent orange; the rest follow the app's greys. It drifts gently and leans toward the pointer. With "reduce motion" set
// it is drawn once and stays still.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { bandFor } from '@aravalli/shared';
import type { Group } from 'three';
import { MathUtils } from 'three';

const BAND_VAR = { Low: '--band-low-bg', Medium: '--band-medium-bg', High: '--band-high-bg', Critical: '--band-critical-bg' } as const;

function readColors(): Record<keyof typeof BAND_VAR, string> {
  const css = getComputedStyle(document.documentElement);
  const get = (v: string, fallback: string) => css.getPropertyValue(v).trim() || fallback;
  return {
    Low: get(BAND_VAR.Low, '#e4e4e0'), Medium: get(BAND_VAR.Medium, '#a1a1aa'), High: get(BAND_VAR.High, '#27272a'), Critical: get('--band-critical-bg', '#f25c05'),
  };
}

/** Re-reads the colours whenever the theme switches, so the tiles match light and dark mode. */
function useBandColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const update = () => setColors(readColors());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

const pointer = { x: 0, y: 0 };

function Tiles({ animate, colors }: { animate: boolean; colors: ReturnType<typeof readColors> }) {
  const group = useRef<Group>(null);
  const tiles = useMemo(() => {
    const out: Array<{ x: number; z: number; h: number; band: keyof typeof BAND_VAR; key: string }> = [];
    for (let l = 1; l <= 5; l++) {
      for (let i = 1; i <= 5; i++) {
        const score = l * i;
        out.push({ key: `${l}-${i}`, x: (i - 3) * 1.06, z: (3 - l) * 1.06, h: 0.16 + score * 0.085, band: bandFor(score) });
      }
    }
    return out;
  }, []);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    if (!animate) { g.rotation.set(-0.02, -0.5, 0); g.position.y = 0; return; }
    const t = state.clock.elapsedTime;
    g.position.y = Math.sin(t * 0.7) * 0.12;
    g.rotation.y = MathUtils.damp(g.rotation.y, -0.5 + pointer.x * 0.35, 3, delta);
    g.rotation.x = MathUtils.damp(g.rotation.x, -0.02 + pointer.y * 0.18, 3, delta);
  });

  return (
    <group ref={group} rotation={[-0.02, -0.5, 0]}>
      {tiles.map((t) => (
        <RoundedBox key={t.key} args={[0.94, t.h, 0.94]} radius={0.06} smoothness={3} position={[t.x, t.h / 2, t.z]}>
          <meshStandardMaterial color={colors[t.band]} roughness={0.55} metalness={t.band === 'Critical' ? 0.1 : 0.05} emissive={t.band === 'Critical' ? colors.Critical : '#000000'} emissiveIntensity={t.band === 'Critical' ? 0.18 : 0} />
        </RoundedBox>
      ))}
    </group>
  );
}

/** A flat, drawn-in-HTML version for browsers without WebGL. Same grid, same colours, no motion. */
export function HeatTilesFallback() {
  const colors = useBandColors();
  return (
    <div aria-hidden="true" className="mx-auto grid aspect-square w-[min(80%,340px)] grid-cols-5 gap-1.5">
      {Array.from({ length: 25 }, (_, n) => {
        const l = 5 - Math.floor(n / 5);
        const i = (n % 5) + 1;
        return <div key={n} className="rounded-md" style={{ background: colors[bandFor(l * i)] }} />;
      })}
    </div>
  );
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export default function HeatTiles3D() {
  const colors = useBandColors();
  const [ok] = useState(webglAvailable);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)));
    if (box.current) io.observe(box.current);
    return () => { mq.removeEventListener('change', onChange); window.removeEventListener('pointermove', onMove); io.disconnect(); };
  }, []);

  if (!ok) return <HeatTilesFallback />;
  return (
    <div ref={box} className="h-full w-full" data-testid="hero-3d">
      <Canvas
        frameloop={visible && !reduced ? 'always' : 'demand'}
        dpr={[1, 1.75]}
        camera={{ position: [0, 6.6, 10.4], fov: 34 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        aria-label="A 5 by 5 risk heat map drawn as floating tiles; taller tiles are higher risk and the critical ones are orange"
        role="img"
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[4, 8, 5]} intensity={1.7} />
        <directionalLight position={[-5, 3, -2]} intensity={0.45} />
        <Tiles animate={!reduced} colors={colors} />
      </Canvas>
    </div>
  );
}
