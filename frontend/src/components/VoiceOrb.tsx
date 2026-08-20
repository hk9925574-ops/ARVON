import { useEffect, useRef } from 'react';
import { VoiceState } from '../services/voice/types';
import './VoiceOrb.css';

interface VoiceOrbProps {
  state: VoiceState;
  audioLevel?: number; // 0.0 to 1.0 representing microphone amplitude
}

export function VoiceOrb({ state, audioLevel = 0 }: VoiceOrbProps) {
  const ringsRef = useRef<HTMLDivElement>(null);

  // Update ring size based on audio level when listening or speaking
  useEffect(() => {
    if (!ringsRef.current) return;
    
    if (state === VoiceState.LISTENING || state === VoiceState.SPEAKING) {
      // Scale audio level from 0-1 to something visible (100% to 150%)
      const scale = 1 + (audioLevel * 0.5);
      ringsRef.current.style.width = `calc(var(--orb-size) * ${scale})`;
      ringsRef.current.style.height = `calc(var(--orb-size) * ${scale})`;
    } else {
      ringsRef.current.style.width = `var(--orb-size)`;
      ringsRef.current.style.height = `var(--orb-size)`;
    }
  }, [audioLevel, state]);

  // CSS class helper
  const getStateClass = () => {
    return `orb-state-${state.toLowerCase()}`;
  };

  return (
    <div className={`voice-orb-container ${getStateClass()}`}>
      {/* Audio visualization rings */}
      <div className="voice-orb-ring" ref={ringsRef}></div>
      <div className="voice-orb-ring" style={{ width: 'calc(var(--orb-size) * 1.1)', height: 'calc(var(--orb-size) * 1.1)' }}></div>
      
      {/* The main orb */}
      <div className="voice-orb"></div>
    </div>
  );
}
