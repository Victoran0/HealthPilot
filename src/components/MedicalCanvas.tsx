"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

class HelixCurve extends THREE.Curve<THREE.Vector3> {
  offset: number;
  constructor(offset = 0) {
    super();
    this.offset = offset;
  }
  getPoint(t: number, optionalTarget = new THREE.Vector3()) {
    // CHANGED: Increased height from 15 to 30 so the ends stay off-screen when tilted
    const height = 30; 
    const radius = 1.5;
    // CHANGED: Increased turns from 4 to 8 to match the new longer height
    const turns = 8; 
    const angle = t * Math.PI * 2 * turns + this.offset;
    
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = (t - 0.5) * height;
    
    return optionalTarget.set(x, y, z);
  }
}

function RealisticDNA() {
  const spinGroupRef = useRef<THREE.Group>(null);
  const floatGroupRef = useRef<THREE.Group>(null);

  const curve1 = useMemo(() => new HelixCurve(0), []);
  const curve2 = useMemo(() => new HelixCurve(Math.PI), []);

  const rungs = useMemo(() => {
    const temp = [];
    const dummy = new THREE.Object3D();
    // CHANGED: Increased rungs from 80 to 150 to fill the longer helix
    const numRungs = 150; 

    for (let i = 0; i < numRungs; i++) {
      const t = i / numRungs;
      const y = (t - 0.5) * 30; // Match new height
      const angle = t * Math.PI * 2 * 8; // Match new turns
      
      const x = Math.cos(angle) * 1.5;
      const z = Math.sin(angle) * 1.5;
      
      dummy.position.set(0, y, 0);
      dummy.lookAt(x, y, z);
      dummy.rotateX(Math.PI / 2);
      dummy.updateMatrix();
      
      temp.push({
        position: new THREE.Vector3(0, y, 0),
        rotation: new THREE.Euler().setFromRotationMatrix(dummy.matrix)
      });
    }
    return temp;
  }, []);

  useFrame((state) => {
    if (spinGroupRef.current) {
      // Spin the DNA around its own local Y axis
      spinGroupRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
    if (floatGroupRef.current) {
      // Gently float the entire structure up and down
      floatGroupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
  });

  const dnaMaterial = (
    <meshStandardMaterial
      color="#020617"
      emissive="#38bdf8"
      emissiveIntensity={2.5}
      toneMapped={false}
      roughness={0.2}
      metalness={0.9}
    />
  );

  return (
    // Outer group handles the floating animation
    <group ref={floatGroupRef}>
      {/* 
        Middle group handles the static tilt. 
        -Math.PI / 4 tilts it 45 degrees (top-left to bottom-right).
        The 0.2 on the X-axis tilts it slightly towards the camera for better 3D depth.
      */}
      <group rotation={[0.2, 0, Math.PI / 3.25]}>
        {/* Inner group handles the continuous spinning */}
        <group ref={spinGroupRef}>
          <mesh>
            {/* Increased tubular segments from 150 to 250 for smoothness over the longer distance */}
            <tubeGeometry args={[curve1, 250, 0.15, 16, false]} />
            {dnaMaterial}
          </mesh>
          <mesh>
            <tubeGeometry args={[curve2, 250, 0.15, 16, false]} />
            {dnaMaterial}
          </mesh>
          {rungs.map((rung, i) => (
            <mesh key={i} position={rung.position} rotation={rung.rotation}>
              <cylinderGeometry args={[0.04, 0.04, 3, 8]} />
              {dnaMaterial}
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export default function MedicalCanvas() {
  return (
    <div className="fixed top-0 left-0 w-full h-screen z-0 pointer-events-none bg-slate-950">
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
        <fog attach="fog" args={["#020617", 4, 12]} />
        
        <ambientLight intensity={0.1} />
        <pointLight position={[10, 10, 10]} intensity={2} color="#ffffff" />
        
        <RealisticDNA />
        
        <EffectComposer disableNormalPass>
          <Bloom 
            luminanceThreshold={0.5}
            mipmapBlur 
            intensity={2.0}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}