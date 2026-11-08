/**
 * The canonical 3D design surface. Orthographic plan and eye-level walk are
 * views *inside* the same engine and scene — not separate 2D drawings.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Edges, Grid, Html, OrbitControls, OrthographicCamera, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Scene, SceneObject, SceneLayer } from '../domain/types';
import { footprintOf, pointInPoly, type Seat } from '../engine/geometry';

export type CameraMode = 'perspective' | 'top' | 'walk';

const LAYER_COLOR: Record<SceneLayer, string> = {
  structure: '#8a8f98',
  stage: '#3a3346',
  audio: '#2f6fd6',
  lighting: '#e0a526',
  video: '#7b4fd6',
  seating: '#5d7a63',
  service: '#c2593a',
  zone: '#2aa198',
  decor: '#a0786a',
};

interface Props {
  scene: Scene;
  cameraMode: CameraMode;
  selected: string[];
  onSelect: (id: string | null, additive: boolean) => void;
  onMove: (id: string, x: number, z: number) => void;
  onRotate: (id: string, rotY: number) => void;
  usableSeats: Seat[];
  lostSeats: Seat[];
  blockedSeats: Set<string>;
  sightTarget: [number, number, number] | null;
  showLabels: boolean;
  hiddenLayers: Set<SceneLayer>;
  transformMode: 'translate' | 'rotate';
  walkSpeed: number;
  eyeHeight: number;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}

function ObjectMesh({ o, selected, onSelect }: { o: SceneObject; selected: boolean; onSelect: Props['onSelect'] }) {
  const [w, h, d] = o.size;
  const color = LAYER_COLOR[o.layer];
  const isZone = o.kind === 'zone';
  const visualOnly = o.dimsSource === 'visual_only';
  return (
    <group position={o.position} rotation={[0, o.rotationY, 0]} name={o.id} userData={{ id: o.id }}>
      <mesh
        position={[0, h / 2, 0]}
        castShadow={!isZone}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect(o.id, e.shiftKey);
        }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} transparent={isZone || visualOnly} opacity={isZone ? 0.25 : visualOnly ? 0.45 : 1} roughness={0.75} />
        <Edges color={selected ? '#f2b33d' : visualOnly ? '#d33' : '#1b1822'} lineWidth={selected ? 3 : 1} />
      </mesh>
    </group>
  );
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();

function Seats({ usable, lost, blocked, block }: { usable: Seat[]; lost: Seat[]; blocked: Set<string>; block: Map<string, SceneObject> }) {
  const all = useMemo(() => [...usable.map((s) => ({ s, state: blocked.has(`${s.blockId}:${s.row}:${s.col}`) ? 'blocked' : 'ok' })), ...lost.map((s) => ({ s, state: 'lost' }))], [usable, lost, blocked]);
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    all.forEach(({ s, state }, i) => {
      const rot = block.get(s.blockId)?.rotationY ?? 0;
      _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      _m.compose(new THREE.Vector3(s.x, 0.225, s.z), _q, new THREE.Vector3(1, state === 'lost' ? 0.15 : 1, 1));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(state === 'ok' ? '#6f9a78' : state === 'blocked' ? '#e0a526' : '#d04545'));
    });
    mesh.count = all.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [all, block]);
  if (!all.length) return null;
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(all.length, 1)]} key={all.length} castShadow>
      <boxGeometry args={[0.45, 0.45, 0.45]} />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}

function Room({ room }: { room: Scene['room'] }) {
  const { widthM: w, depthM: d, heightM: h } = room;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#d9d3c7" roughness={1} />
      </mesh>
      <Grid args={[w, d]} cellSize={0.5} sectionSize={5} cellColor="#bdb5a6" sectionColor="#8f8676" fadeDistance={80} position={[0, 0.001, 0]} />
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        <Edges color={room.source === 'user_measured' || room.source === 'verified' ? '#2a2733' : '#9a8f7c'} />
      </mesh>
    </group>
  );
}

function SelectedTransform({ id, mode, onMove, onRotate }: { id: string; mode: 'translate' | 'rotate'; onMove: Props['onMove']; onRotate: Props['onRotate'] }) {
  const { scene } = useThree();
  const [target, setTarget] = useState<THREE.Object3D | null>(null);
  useEffect(() => {
    setTarget(scene.getObjectByName(id) ?? null);
  }, [id, scene]);
  if (!target) return null;
  return (
    <TransformControls
      object={target}
      mode={mode}
      showY={mode === 'rotate'}
      showX={mode === 'translate'}
      showZ={mode === 'translate'}
      translationSnap={0.25}
      rotationSnap={Math.PI / 24}
      onMouseUp={() => {
        if (mode === 'translate') onMove(id, target.position.x, target.position.z);
        else onRotate(id, target.rotation.y);
      }}
    />
  );
}

function Walk({ scene, speed, eye }: { scene: Scene; speed: number; eye: number }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(Math.PI);
  const pitch = useRef(0);
  useEffect(() => {
    camera.position.set(0, eye, scene.room.depthM / 2 - 2);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    let dragging = false;
    const md = () => (dragging = true);
    const mu = () => (dragging = false);
    const mm = (e: MouseEvent) => {
      if (!dragging) return;
      yaw.current -= e.movementX * 0.004;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - e.movementY * 0.004));
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    gl.domElement.addEventListener('mousedown', md);
    window.addEventListener('mouseup', mu);
    window.addEventListener('mousemove', mm);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      gl.domElement.removeEventListener('mousedown', md);
      window.removeEventListener('mouseup', mu);
      window.removeEventListener('mousemove', mm);
    };
    // Camera starts at the back of house once per entry into walk mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const obstacles = useMemo(() => scene.objects.filter((o) => !o.hidden && o.kind !== 'zone' && o.kind !== 'door').map((o) => footprintOf(o, 0.2)), [scene]);
  useFrame((_, dt) => {
    const k = keys.current;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (k.has('q')) yaw.current += dt * 1.5;
    if (k.has('e')) yaw.current -= dt * 1.5;
    const step = speed * Math.min(dt, 0.1);
    const fx = -Math.sin(yaw.current);
    const fz = -Math.cos(yaw.current);
    // Right vector is forward rotated −90° about Y.
    const rx = Math.cos(yaw.current);
    const rz = -Math.sin(yaw.current);
    const tx = camera.position.x + (fx * f + rx * s) * step;
    const tz = camera.position.z + (fz * f + rz * s) * step;
    const hx = scene.room.widthM / 2 - 0.3;
    const hz = scene.room.depthM / 2 - 0.3;
    const blocked = obstacles.some((fp) => pointInPoly([tx, tz], fp.corners));
    if (!blocked && Math.abs(tx) < hx && Math.abs(tz) < hz) camera.position.set(tx, eye, tz);
    else camera.position.y = eye;
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
  });
  return null;
}

export function Viewport(p: Props) {
  const visible = p.scene.objects.filter((o) => !o.hidden && !p.hiddenLayers.has(o.layer));
  const blocks = useMemo(() => new Map(p.scene.objects.filter((o) => o.kind === 'seat_block').map((o) => [o.id, o])), [p.scene.objects]);
  const span = Math.max(p.scene.room.widthM, p.scene.room.depthM);
  const primary = p.selected[0];
  const primaryObj = p.scene.objects.find((o) => o.id === primary);
  return (
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ gl }) => (p.canvasRef.current = gl.domElement)}
      onPointerMissed={(e) => e.button === 0 && p.cameraMode !== 'walk' && p.onSelect(null, false)}
      aria-label="3D scene viewport"
    >
      <color attach="background" args={['#efebe4']} />
      <hemisphereLight args={['#ffffff', '#b8ad98', 0.9]} />
      <directionalLight position={[span * 0.4, span, span * 0.6]} intensity={1.3} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span} />
      {p.cameraMode === 'perspective' && <PerspectiveCamera makeDefault position={[span * 0.8, span * 0.7, span * 0.9]} fov={45} />}
      {p.cameraMode === 'top' && <OrthographicCamera makeDefault position={[0, 60, 0.001]} zoom={Math.min(900 / span, 60)} near={0.1} far={200} />}
      {p.cameraMode === 'walk' && <PerspectiveCamera makeDefault fov={70} near={0.05} />}
      {p.cameraMode !== 'walk' && <OrbitControls makeDefault enableRotate={p.cameraMode === 'perspective'} target={[0, 0, 0]} maxPolarAngle={Math.PI / 2 - 0.02} />}
      {p.cameraMode === 'walk' && <Walk scene={p.scene} speed={p.walkSpeed} eye={p.eyeHeight} />}
      <Room room={p.scene.room} />
      {visible.filter((o) => o.kind !== 'seat_block').map((o) => (
        <ObjectMesh key={o.id} o={o} selected={p.selected.includes(o.id)} onSelect={p.onSelect} />
      ))}
      {!p.hiddenLayers.has('seating') && <Seats usable={p.usableSeats} lost={p.lostSeats} blocked={p.blockedSeats} block={blocks} />}
      {/* Seat blocks: a thin selectable footprint under the seats */}
      {visible.filter((o) => o.kind === 'seat_block').map((o) => (
        <group key={o.id} name={o.id} position={o.position} rotation={[0, o.rotationY, 0]}>
          <mesh position={[0, 0.01, 0]} onClick={(e) => (e.stopPropagation(), p.onSelect(o.id, e.shiftKey))}>
            <boxGeometry args={[o.size[0], 0.02, o.size[2]]} />
            <meshStandardMaterial color="#5d7a63" transparent opacity={0.25} />
            <Edges color={p.selected.includes(o.id) ? '#f2b33d' : '#5d7a63'} lineWidth={p.selected.includes(o.id) ? 3 : 1} />
          </mesh>
        </group>
      ))}
      {p.sightTarget && p.cameraMode !== 'walk' && (
        <mesh position={p.sightTarget}>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshBasicMaterial color="#f2b33d" />
        </mesh>
      )}
      {p.showLabels &&
        p.cameraMode !== 'walk' &&
        visible
          .filter((o) => ['stage_deck', 'seat_block', 'bar', 'merch', 'checkin', 'mixer', 'zone', 'screen', 'door'].includes(o.kind))
          .map((o) => (
            <Html key={`l-${o.id}`} position={[o.position[0], o.position[1] + o.size[1] + 0.3, o.position[2]]} center className="scene-label" zIndexRange={[10, 0]}>
              {o.label}
            </Html>
          ))}
      {primary && primaryObj && !primaryObj.locked && p.cameraMode !== 'walk' && p.selected.length === 1 && (
        <SelectedTransform key={`${primary}-${p.transformMode}-${primaryObj.position.join(',')}-${primaryObj.rotationY}`} id={primary} mode={p.transformMode} onMove={p.onMove} onRotate={p.onRotate} />
      )}
    </Canvas>
  );
}
