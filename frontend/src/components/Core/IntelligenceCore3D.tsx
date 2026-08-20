import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sphere, MeshDistortMaterial, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { CoreState } from './IntelligenceCore';
import './IntelligenceCore.css'; // Reuse existing styles for text overlay

interface Props {
  state: CoreState;
  details?: string;
  size?: number;
  isSpeaking?: boolean;
  audioLevel?: number; // 0 to 1
}

const getMode = (state: CoreState, isSpeaking: boolean) => {
  if (isSpeaking || state === 'RESPONDING') return 'speaking';
  if (state === 'ACTIVE' || state === 'ANALYZING' || state === 'TOOL') return 'thinking';
  return 'idle';
};

const CoreMesh: React.FC<{ mode: 'idle' | 'thinking' | 'speaking', audioLevel: number, dpr: number }> = ({ mode, audioLevel, dpr }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  
  // Target values for smooth interpolation
  const targetDistort = mode === 'speaking' ? 0.5 + (audioLevel * 0.7) : mode === 'thinking' ? 0.4 : 0.2;
  const targetSpeed = mode === 'speaking' ? 4 : mode === 'thinking' ? 2 : 0.5;
  
  // Colors EV_CORE UI
  const colorIdle = new THREE.Color('#00f0ff'); // Cyan
  const colorThinking = new THREE.Color('#9d00ff'); // Purple
  const colorSpeaking = new THREE.Color('#00ffff'); // Bright Cyan
  
  const targetColor = mode === 'speaking' ? colorSpeaking : mode === 'thinking' ? colorThinking : colorIdle;

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * (mode === 'thinking' ? 0.5 : 0.2);
      meshRef.current.rotation.y += delta * (mode === 'thinking' ? 0.7 : 0.3);
    }
    
    if (materialRef.current) {
      // Smoothly interpolate values
      materialRef.current.distort = THREE.MathUtils.lerp(materialRef.current.distort, targetDistort, delta * 5);
      materialRef.current.speed = THREE.MathUtils.lerp(materialRef.current.speed, targetSpeed, delta * 5);
      materialRef.current.color.lerp(targetColor, delta * 3);
      
      // Pulse emissive intensity slightly on audio
      const baseEmissive = mode === 'thinking' ? 0.8 : 0.4;
      materialRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        materialRef.current.emissiveIntensity, 
        baseEmissive + (audioLevel * 0.6), 
        delta * 10
      );
    }
  });

  // Graceful fallback: adjust geometry segments based on performance ratio (dpr)
  const segments = dpr < 1 ? 32 : 64;

  return (
    <Sphere ref={meshRef} args={[1, segments, segments]}>
      <MeshDistortMaterial
        ref={materialRef}
        color="#00f0ff"
        emissive="#004488"
        emissiveIntensity={0.5}
        roughness={0.2}
        metalness={0.8}
        distort={0.2}
        speed={1}
        transparent
        opacity={0.85}
        wireframe={dpr < 0.8} // Fallback to wireframe if extremely low performance
      />
    </Sphere>
  );
};

export const IntelligenceCore3D: React.FC<Props> = ({ state, details, size = 200, isSpeaking = false, audioLevel = 0 }) => {
  const mode = getMode(state, isSpeaking);
  const [dpr, setDpr] = useState(1.5);
  
  return (
    <div style={{ width: size, height: size, position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      {/* Container for the 3D Canvas */}
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}>
        <Canvas 
          camera={{ position: [0, 0, 2.5], fov: 45 }}
          dpr={dpr}
          gl={{ antialias: false, powerPreference: 'low-power' }}
        >
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1.5} color="#00f0ff" />
          <pointLight position={[-10, -10, -10]} intensity={1} color="#9d00ff" />
          
          <PerformanceMonitor onDecline={() => setDpr(0.75)} onIncline={() => setDpr(1.5)} bounds={() => [40, 60]}>
            <CoreMesh mode={mode} audioLevel={audioLevel} dpr={dpr} />
          </PerformanceMonitor>
        </Canvas>
      </div>
      
      {/* State details text overlay (Reusing existing CSS classes for styling) */}
      <div className={`core-details state-${state.toLowerCase()}`} style={{
        position: 'absolute',
        bottom: '-40px',
        width: '200%',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: 10
      }}>
        {details || state}
      </div>
    </div>
  );
};
