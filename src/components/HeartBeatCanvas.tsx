"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

// Mathematical generation of an ECG/EKG wave
class EKGCurve extends THREE.Curve<THREE.Vector3> {
  getPoint(t: number, optionalTarget = new THREE.Vector3()) {
    const length = 60; // Make the line very long so ends are off-screen
    const x = (t - 0.5) * length;
    
    const period = 6; // Distance between each heartbeat
    // Modulo math to make the heartbeat repeat infinitely
    const xMod = ((x % period) + period) % period - period / 2; 
    
    // Gaussian functions to create the specific waves of a heartbeat
    const pWave = 0.2 * Math.exp(-Math.pow(xMod + 1.0, 2) / 0.02);
    const qWave = -0.3 * Math.exp(-Math.pow(xMod + 0.15, 2) / 0.005);
    const rWave = 3.0 * Math.exp(-Math.pow(xMod, 2) / 0.005); // The main spike
    const sWave = -0.5 * Math.exp(-Math.pow(xMod - 0.15, 2) / 0.005);
    const tWave = 0.4 * Math.exp(-Math.pow(xMod - 1.0, 2) / 0.04);
    
    // Combine the waves
    const y = pWave + qWave + rWave + sWave + tWave;
    
    return optionalTarget.set(x, y, 0);
  }
}

function HeartbeatLine() {
  const lineRef = useRef<THREE.Mesh>(null);
  const curve = useMemo(() => new EKGCurve(), []);

  useFrame((state) => {
    if (lineRef.current) {
      // Scroll the line to the left to simulate the monitor reading
      // The modulo (%) ensures it snaps back seamlessly
      lineRef.current.position.x = -(state.clock.elapsedTime * 2.5) % 6;
    }
  });

  return (
    <group rotation={[0, 0.1, 0.05]}> {/* Slight 3D tilt for depth */}
      <mesh ref={lineRef}>
        {/* 500 segments for a perfectly smooth curve */}
        <tubeGeometry args={[curve, 500, 0.04, 8, false]} />
        <meshStandardMaterial 
          color="#020617" 
          emissive="#38bdf8" // Cyan glow
          emissiveIntensity={2.5} 
          toneMapped={false} 
        />
      </mesh>
    </group>
  );
}

function MedicalGrid() {
  return (
    // A subtle background grid typical of ECG monitors
    <gridHelper 
      args={[100, 100, "#0284c7", "#082f49"]} 
      rotation={[Math.PI / 2, 0, 0]} 
      position={[0, 0, -2]} 
    />
  );
}

export default function HeartbeatCanvas() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
        {/* Dark fog fades the edges of the grid and line into the background */}
        <fog attach="fog" args={["#020617", 5, 15]} />
        
        <MedicalGrid />
        <HeartbeatLine />
        
        <EffectComposer disableNormalPass>
          <Bloom 
            luminanceThreshold={0.2}
            mipmapBlur 
            intensity={1.5}
          />
        </EffectComposer>
      </Canvas>
      
      {/* Vignette overlay to darken the edges and keep text readable */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020617_100%)]" />
    </div>
  );
}