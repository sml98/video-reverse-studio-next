import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export const GlbViewer: React.FC<{ url: string; height?: number }> = ({ url, height = 280 }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [clips, setClips] = useState<string[]>([]);
  const [activeClip, setActiveClip] = useState<string>("");
  const [err, setErr] = useState<string>("");
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const gltfClipsRef = useRef<THREE.AnimationClip[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setErr("");
    setClips([]);
    setActiveClip("");

    const w = el.clientWidth || 440;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0e14);

    const camera = new THREE.PerspectiveCamera(40, w / height, 0.1, 100);
    camera.position.set(0, 1.8, 4.2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setErr("WebGL indisponível neste navegador.");
      return;
    }
    renderer.setSize(w, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.innerHTML = "";
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xa7f3d0, 1.6);
    dir.position.set(3, 5, 4);
    scene.add(dir);
    const grid = new THREE.GridHelper(6, 12, 0x334155, 0x1e293b);
    scene.add(grid);

    const pivot = new THREE.Group();
    scene.add(pivot);

    let raf = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (disposed) return;
        const root = gltf.scene;
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 2.0 / maxDim;
        root.scale.setScalar(scale);
        root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        pivot.add(root);

        if (gltf.animations && gltf.animations.length > 0) {
          gltfClipsRef.current = gltf.animations;
          const names = gltf.animations.map((a, idx) => a.name || `clip_${idx + 1}`);
          setClips(names);
          const mixer = new THREE.AnimationMixer(root);
          mixerRef.current = mixer;
          const first = gltf.animations[0];
          mixer.clipAction(first).play();
          setActiveClip(names[0]);
        }
      },
      undefined,
      (e) => {
        if (!disposed) setErr(`Falha ao carregar modelo 3D: ${String(e)}`);
      },
    );

    const tick = () => {
      if (disposed) return;
      const dt = clock.getDelta();
      pivot.rotation.y += dt * 0.45;
      if (mixerRef.current) mixerRef.current.update(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      mixerRef.current?.stopAllAction();
      renderer.dispose();
    };
  }, [url, height]);

  const selectClip = (name: string) => {
    setActiveClip(name);
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.stopAllAction();
    const found = gltfClipsRef.current.find((c, i) => (c.name || `clip_${i + 1}`) === name);
    if (found) mixer.clipAction(found).reset().play();
  };

  return (
    <div className="col" style={{ gap: 8 }}>
      <div ref={ref} style={{ width: "100%", height, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }} />
      {err && <div className="muted" style={{ fontSize: 12, color: "var(--bad)" }}>{err}</div>}
      {clips.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12 }}>Clipes esqueléticos ({clips.length}):</span>
          <select value={activeClip} onChange={(e) => selectClip(e.target.value)} style={{ maxWidth: 260, padding: "4px 8px", fontSize: 12 }}>
            {clips.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
