import React from 'react';
import './IntelligenceCore.css';

export type CoreState = 'IDLE' | 'ACTIVE' | 'ANALYZING' | 'TOOL' | 'RESPONDING' | 'COMPLETE';

interface Props {
  state: CoreState;
  details?: string;
  size?: number;
  isSpeaking?: boolean;
}

export const IntelligenceCore: React.FC<Props> = ({ state, details, size = 200, isSpeaking = false }) => {
  return (
    <div className="core-container" style={{ width: size, height: size }}>
      {/* Ambient glowing field behind the core */}
      <div className={`core-field state-${state.toLowerCase()}`} />
      
      {/* The main orb nucleus */}
      <div className={`core-nucleus state-${state.toLowerCase()} ${isSpeaking ? 'speaking-pulse' : ''}`}>
        <div className="core-energy" />
      </div>
      
      {/* Orbital rings */}
      <div className={`core-ring ring-1 state-${state.toLowerCase()}`} />
      <div className={`core-ring ring-2 state-${state.toLowerCase()}`} />

      {/* State details text (ANALYZING, TOOL executing, etc) */}
      <div className={`core-details state-${state.toLowerCase()}`}>
        {details || state}
      </div>
    </div>
  );
};
