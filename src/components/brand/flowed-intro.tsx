"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INTRO_SEEN_KEY } from "@/lib/intro";
import { FlowedMark } from "./flowed-mark";

const DURATION = 2.7; // seconds, length of the AnimationClip
const EXIT_MS = 450;

/**
 * Three.js scene: glowing ribbons draw across the screen with particles riding
 * them, then converge on the logo. Timeline is a single AnimationClip played
 * once by an AnimationMixer; its "finished" event ends the intro.
 */
async function runScene(canvas: HTMLCanvasElement, onFinished: () => void): Promise<() => void> {
  const THREE = await import("three");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
  camera.name = "camera";
  camera.position.set(0, 0, 7);
  scene.add(camera); // in the graph so the mixer can bind "camera.position"

  const flow = new THREE.Group();
  flow.name = "flow";
  scene.add(flow);

  // ---- Ribbons: wavy tubes whose shader reveals them left→right with a bright head.
  const palette = [["#6366F1", "#A855F7"], ["#4F46E5", "#C026D3"], ["#818CF8", "#7C3AED"], ["#7C3AED", "#EC4899"], ["#6366F1", "#22D3EE"]];
  const ribbonMat = (a: string, b: string, delay: number) =>
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uDelay: { value: delay }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float uProgress, uTime, uOpacity, uDelay; uniform vec3 uA, uB; varying vec2 vUv;
        void main(){
          float head = clamp((uProgress - uDelay) / (1.0 - uDelay), 0.0, 1.0) * 1.15;
          float body = smoothstep(head, head - 0.2, vUv.x);
          float tip = exp(-pow((vUv.x - head) * 14.0, 2.0));
          float shimmer = 0.75 + 0.25 * sin(vUv.x * 46.0 - uTime * 7.0);
          float edge = sin(vUv.y * 3.14159);
          vec3 col = mix(uA, uB, vUv.x) + tip * 0.8;
          gl_FragColor = vec4(col, (body * 0.9 * shimmer + tip * 1.4) * edge * uOpacity);
        }`,
    });
  const curves: InstanceType<typeof THREE.CatmullRomCurve3>[] = [];
  const ribbons: InstanceType<typeof THREE.Mesh>[] = [];
  palette.forEach(([a, b], i) => {
    const pts = [];
    const amp = 0.7 + i * 0.15, freq = 0.5 + i * 0.07, phase = i * 1.3, y0 = (i - 2) * 0.95;
    for (let x = -7; x <= 7; x += 0.5) pts.push(new THREE.Vector3(x, y0 + Math.sin(x * freq + phase) * amp, Math.cos(x * 0.4 + i) * 0.6 - 0.5));
    const curve = new THREE.CatmullRomCurve3(pts);
    curves.push(curve);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.035 + (i % 2) * 0.02, 10, false), ribbonMat(a, b, i * 0.06));
    flow.add(mesh);
    ribbons.push(mesh);
  });

  // ---- Particles riding the ribbons (positions from precomputed lookups).
  const lookups = curves.map((c) => c.getSpacedPoints(400));
  const COUNT = window.innerWidth < 640 ? 600 : 1000;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const seeds = Array.from({ length: COUNT }, (_, i) => ({ curve: i % curves.length, phase: Math.random(), speed: 0.08 + Math.random() * 0.12, jitter: new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25) }));
  seeds.forEach((s, i) => { const c = new THREE.Color(palette[s.curve][Math.random() > 0.5 ? 0 : 1]).lerp(new THREE.Color("#ffffff"), 0.35); colors.set([c.r, c.g, c.b], i * 3); });
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const dot = document.createElement("canvas");
  dot.width = dot.height = 64;
  const g = dot.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(0.35, "rgba(255,255,255,0.6)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const sprite = new THREE.CanvasTexture(dot);
  const pMat = new THREE.PointsMaterial({ size: 0.22, map: sprite, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const particles = new THREE.Points(pGeo, pMat);
  particles.name = "particles";
  flow.add(particles);

  // ---- Timeline. "driver" carries values the shaders read: x = draw progress, y = ribbon fade.
  const driver = new THREE.Object3D();
  driver.name = "driver";
  scene.add(driver);
  const clip = new THREE.AnimationClip("flowed-intro", DURATION, [
    new THREE.NumberKeyframeTrack("driver.position[x]", [0, 1.5], [0, 1]),
    new THREE.NumberKeyframeTrack("driver.position[y]", [0, 2.05, DURATION], [1, 1, 0]),
    new THREE.VectorKeyframeTrack("flow.scale", [0, 1.7, DURATION], [1.18, 1.18, 1.18, 1, 1, 1, 0.42, 0.42, 0.42], THREE.InterpolateSmooth),
    new THREE.NumberKeyframeTrack("flow.rotation[z]", [0, DURATION], [-0.09, 0.07]),
    new THREE.VectorKeyframeTrack("camera.position", [0, 1.8, DURATION], [0, 0, 7.4, 0, 0, 6.6, 0, 0, 4.4], THREE.InterpolateSmooth),
    new THREE.NumberKeyframeTrack("particles.material.opacity", [0, 0.35, 2.1, DURATION], [0, 0.95, 0.95, 0]),
  ]);
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  mixer.addEventListener("finished", onFinished);
  action.play();

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait phones: widen the view so ribbons still span the screen.
    camera.fov = w < h ? 62 : 45;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const clock = new THREE.Clock();
  let raf = 0;
  const tmp = new THREE.Vector3();
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    mixer.update(dt);
    const t = clock.elapsedTime;
    for (const r of ribbons) {
      const u = (r.material as InstanceType<typeof THREE.ShaderMaterial>).uniforms;
      u.uProgress.value = driver.position.x;
      u.uOpacity.value = driver.position.y;
      u.uTime.value = t;
    }
    const head = driver.position.x * 1.15;
    seeds.forEach((s, i) => {
      // Particles only travel behind each ribbon's drawing head.
      const along = ((s.phase + t * s.speed) % 1) * Math.min(1, head);
      const lut = lookups[s.curve];
      tmp.copy(lut[Math.floor(along * (lut.length - 1))]).add(s.jitter);
      positions.set([tmp.x, tmp.y, tmp.z], i * 3);
    });
    pGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  tick();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    mixer.removeEventListener("finished", onFinished);
    mixer.stopAllAction();
    ribbons.forEach((r) => { r.geometry.dispose(); (r.material as InstanceType<typeof THREE.ShaderMaterial>).dispose(); });
    pGeo.dispose(); pMat.dispose(); sprite.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}

const WORD = "Flowed".split("");

export function FlowedIntro() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<"playing" | "leaving" | "gone">("playing");
  const [webgl, setWebgl] = useState(false);

  const finish = useCallback(() => {
    setPhase((p) => (p === "playing" ? "leaving" : p));
  }, []);

  useEffect(() => {
    // Already seen this session / turned off: CSS keeps the overlay hidden.
    if (document.documentElement.dataset.intro === "skip") return;
    try { sessionStorage.setItem(INTRO_SEEN_KEY, "1"); } catch { /* private mode */ }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    // Safety net: never block the app, even if WebGL or the chunk fails.
    const fallback = setTimeout(finish, reduced ? 900 : (DURATION + 0.6) * 1000);
    if (!reduced && canvasRef.current) {
      runScene(canvasRef.current, finish).then((c) => {
        if (cancelled) c(); else { cleanup = c; setWebgl(true); }
      }).catch(() => undefined);
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(); };
    window.addEventListener("keydown", onKey);
    return () => { cancelled = true; clearTimeout(fallback); cleanup?.(); window.removeEventListener("keydown", onKey); };
  }, [finish]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  return (
    <div id="flowed-intro" data-phase={phase} onClick={finish}
      className="flowed-intro fixed inset-0 z-[200] flex cursor-pointer flex-col items-center justify-center overflow-hidden select-none">
      <canvas ref={canvasRef} aria-hidden className={`absolute inset-0 size-full transition-opacity duration-500 ${webgl ? "opacity-100" : "opacity-0"}`} />
      <p className="sr-only" role="status">Opening Flowed</p>
      <div className="relative flex flex-col items-center" aria-hidden>
        <div className="intro-mark-glow absolute top-6 size-40 rounded-full" />
        <FlowedMark className="intro-mark relative size-28 sm:size-32" />
        <p className="mt-6 flex text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
          {WORD.map((ch, i) => (
            <span key={i} className="intro-letter inline-block" style={{ animationDelay: `${0.75 + i * 0.06}s` }}>{ch}</span>
          ))}
        </p>
        <p className="intro-tagline mt-3 text-sm font-medium tracking-[0.3em] text-violet-200/80 uppercase">Plan · Focus · Flow</p>
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); finish(); }}
        className="absolute right-4 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white/85 backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-white/60 outline-none">
        Skip intro
      </button>
    </div>
  );
}
