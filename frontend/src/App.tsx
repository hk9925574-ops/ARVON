import { useState, useEffect, useRef } from 'react';
import { wsService } from './services/websocket';
import { voiceActivationService } from './services/voice/VoiceActivationService';
import { VoiceState } from './services/voice/types';
import { NeuralField } from './components/Environment/NeuralField';
import { CoreState } from './components/Core/IntelligenceCore';
import { IntelligenceCore3D as IntelligenceCore } from './components/Core/IntelligenceCore3D';
import { CommandBar } from './components/CommandBar/CommandBar';
import { ResponseRenderer } from './components/Responses/ResponseRenderer';
import { SidePanel } from './components/SidePanel/SidePanel';

type DesktopMode = 'INITIALIZING' | 'CORE' | 'CONVERSATION' | 'FOCUS' | 'KNOWLEDGE' | 'DIAGNOSTICS';

function App() {
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [mode, setMode] = useState<DesktopMode>('INITIALIZING');
  const [coreState, setCoreState] = useState<CoreState>('IDLE');
  const [coreDetails, setCoreDetails] = useState('');
  const [history, setHistory] = useState<{role: 'user'|'arvon'|'system', text: string, format?: string, metadata?: any, isStreaming?: boolean}[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [theme, setTheme] = useState<'DARK'|'LIGHT'|'WHISPER'>('DARK');
  const [animationLevel, setAnimationLevel] = useState<'LOW'|'MEDIUM'|'HIGH'>('MEDIUM');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnabled, setSpeechEnabledState] = useState(() => {
    return localStorage.getItem('arvon_speech_enabled') === 'true';
  });
  const speechEnabledRef = useRef(speechEnabled);

  const setSpeechEnabled = (value: boolean) => {
    setSpeechEnabledState(value);
    speechEnabledRef.current = value;
  };
  const [simulateTtsFailure, setSimulateTtsFailure] = useState(false);
  
  const [actionToasts, setActionToasts] = useState<{id: number, text: string}[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<{executionId: string, details: any} | null>(null);
  const [voiceProb, setVoiceProb] = useState<number>(0);

  const historyEndRef = useRef<HTMLDivElement>(null);

  // Audio streaming context
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  useEffect(() => {
    document.body.setAttribute('data-animation', animationLevel.toLowerCase());
    document.body.setAttribute('data-theme', theme.toLowerCase());
  }, [animationLevel, theme]);

  // Audio level simulation for the 3D core
  const [audioLevel, setAudioLevel] = useState(0);
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    
    const simulateAudio = (time: number) => {
      if (isSpeaking) {
        if (time - lastTime > 100) {
          // Generate a semi-random waveform amplitude
          const r = Math.random();
          const target = r > 0.8 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.5;
          setAudioLevel(target);
          lastTime = time;
        }
        animationFrameId = requestAnimationFrame(simulateAudio);
      } else {
        setAudioLevel(0);
      }
    };

    if (isSpeaking) {
      animationFrameId = requestAnimationFrame(simulateAudio);
    } else {
      setAudioLevel(0);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isSpeaking]);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const initAudio = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new window.AudioContext({ sampleRate: 22050 });
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }
    };
    document.addEventListener('click', initAudio, { once: true });
    
    return () => document.removeEventListener('click', initAudio);
  }, []);

  // Loading Sequence
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    if (mode === 'INITIALIZING') {
      const timer = setTimeout(() => {
        setMode('CORE');
      }, 1500); // Short animation
      return () => { clearTimeout(timer); window.removeEventListener('keydown', handleGlobalKeyDown); };
    }
    
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [mode]);

  useEffect(() => {
    wsService.connect();

    const unsubscribeStatus = wsService.onConnectionChange((status) => {
      setWsStatus(status);
      if (status === 'connected') {
        wsService.send({
          type: 'update_speech_settings',
          payload: { speechEnabled: speechEnabledRef.current }
        });
      } else if (status === 'disconnected') {
        setCoreState('IDLE');
        // Do not pollute conversation history with disconnects
        setMode('CONVERSATION');
      }
    });

    const unsubscribeMessage = wsService.onMessage((msg) => {
      if (msg.type === 'audio_stream_chunk') {
        if (!audioContextRef.current) return;
        const ctx = audioContextRef.current;
        const buffer = msg.payload as ArrayBuffer;
        const int16Array = new Int16Array(buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }
        const audioBuffer = ctx.createBuffer(1, float32Array.length, 22050);
        audioBuffer.getChannelData(0).set(float32Array);
        
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        const currentTime = ctx.currentTime;
        if (nextStartTimeRef.current < currentTime) {
            nextStartTimeRef.current = currentTime + 0.05; // small buffer
        }
        source.start(nextStartTimeRef.current);
        nextStartTimeRef.current += audioBuffer.duration;
      }
      if (msg.type === 'core_state') {
        setCoreState(msg.payload.state as CoreState);
        setCoreDetails(msg.payload.details);
      }
      if (msg.type === 'ai_stream_started') {
        setHistory(prev => [...prev, { role: 'arvon', text: '', isStreaming: true }]);
        if (mode === 'CORE') setMode('CONVERSATION');
      }
      if (msg.type === 'ai_stream_chunk') {
        setHistory(prev => {
           const newHistory = [...prev];
           const lastMsg = newHistory[newHistory.length - 1];
           if (lastMsg && lastMsg.role === 'arvon' && lastMsg.isStreaming) {
               lastMsg.text += msg.payload.chunk;
           }
           return newHistory;
        });
      }
      if (msg.type === 'ai_response') {
        setHistory(prev => {
           const newHistory = [...prev];
           const lastMsg = newHistory[newHistory.length - 1];
           if (lastMsg && lastMsg.role === 'arvon' && lastMsg.isStreaming) {
               lastMsg.text = msg.payload.text;
               lastMsg.format = msg.payload.format;
               lastMsg.metadata = msg.payload.metadata;
               lastMsg.isStreaming = false;
           } else {
               newHistory.push({ role: 'arvon', text: msg.payload.text, format: msg.payload.format, metadata: msg.payload.metadata });
           }
           return newHistory;
        });
        setCoreState('COMPLETE');
        setTimeout(() => setCoreState('IDLE'), 2000);
        if (mode === 'CORE') setMode('CONVERSATION');
      }
      if (msg.type === 'ACTION_LOGGED') {
        const id = Date.now();
        const text = `[Log] ${msg.payload.toolName}: ${JSON.stringify(msg.payload.args)}`;
        setActionToasts(prev => [...prev, { id, text }]);
        setTimeout(() => setActionToasts(prev => prev.filter(t => t.id !== id)), 4000);
      }
      if (msg.type === 'CONFIRM_REQUIRED') {
        setConfirmRequest({ executionId: msg.payload.executionId, details: msg.payload });
        if (mode === 'CORE') setMode('CONVERSATION');
      }
      if (msg.type === 'agent_progress') {
        const id = Date.now() + Math.random();
        setActionToasts(prev => [...prev, { id, text: `[Agent] ${msg.payload.message}` }]);
        setTimeout(() => setActionToasts(prev => prev.filter(t => t.id !== id)), 6000);
      }
      if (msg.type === 'agent_complete') {
        setHistory(prev => [...prev, { role: 'arvon', text: `Agent Task Complete:\n${msg.payload.result}`, format: 'TEXT' }]);
        if (mode === 'CORE') setMode('CONVERSATION');
      }
      if (msg.type === 'tts_speak') {
        if (!speechEnabled) return;
        if (simulateTtsFailure) {
           console.warn('[TTS] Simulated failure triggered. Falling back to text-only.');
           return;
        }

        const text = msg.payload.text;
        const utterance = new SpeechSynthesisUtterance(text);
        
        let speechText = text;
        if (speechText.includes('[SERIOUS]')) {
            utterance.rate = 0.8;
            utterance.pitch = 0.8;
            speechText = speechText.replace(/\[SERIOUS\]/g, '');
        } else if (speechText.includes('[FAST]')) {
            utterance.rate = 1.3;
            utterance.pitch = 1.1;
            speechText = speechText.replace(/\[FAST\]/g, '');
        } else if (speechText.includes('[EXCITED]')) {
            utterance.rate = 1.2;
            utterance.pitch = 1.3;
            speechText = speechText.replace(/\[EXCITED\]/g, '');
        } else {
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
        }

        // Strip out formatting/code blocks for speech so it reads nicely
        utterance.text = speechText.replace(/```[\s\S]*?```/g, "Code block omitted.")
                             .replace(/[*_#`]/g, "");

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        
        window.speechSynthesis.speak(utterance);
      }
    });

    const unsubscribeVoice = voiceActivationService.onStateChange((state) => {
      if (state === VoiceState.LISTENING) setCoreState('ACTIVE');
      if (state === VoiceState.PROCESSING) setCoreState('ANALYZING');
      if (state === VoiceState.SPEAKING) setCoreState('RESPONDING');
      if (state === VoiceState.STANDBY) setCoreState('IDLE');
      if (state === VoiceState.ERROR) {
        setCoreState('IDLE');
        setHistory(prev => [...prev, { role: 'system', text: 'Voice Engine Error - Fallback to Text', format: 'ERROR' }]);
      }
    });

    const unsubscribeProb = voiceActivationService.onProbability((prob) => {
      setVoiceProb(prob);
    });

    voiceActivationService.initialize();

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      unsubscribeVoice();
      unsubscribeProb();
      wsService.disconnect();
      voiceActivationService.destroy();
    };
  }, []);

  useEffect(() => {
    if (mode === 'CONVERSATION') {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, mode]);

  const handleToggleSpeech = () => {
    const newValue = !speechEnabled;
    setSpeechEnabled(newValue);
    localStorage.setItem('arvon_speech_enabled', newValue.toString());
    if (wsStatus === 'connected') {
      wsService.send({
        type: 'update_speech_settings',
        payload: { speechEnabled: newValue }
      });
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Escape - close panel
      if (e.key === 'Escape') {
        setIsSettingsOpen(false);
      }
      // Ctrl + L - clear conversation
      if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setHistory([]);
        setMode('CORE');
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [rippleActive, setRippleActive] = useState(false);

  const handleSendText = (text: string, attachments?: {name: string, mimeType: string, data: string}[]) => {
    // Phase 1: Command Bar (triggers Ripple)
    setRippleActive(true);
    
    // Phase 2: Energy Pulse -> Neural Field -> Core
    setTimeout(() => {
      setCoreState('ACTIVE');
      setRippleActive(false);
      setCoreDetails('');
      
      // Phase 3/4/5: AI Processing and Response
      wsService.send({
        type: 'text_request',
        requestId: crypto.randomUUID(),
        payload: { text, speechEnabled: speechEnabledRef.current, attachments }
      });

      let promptMsg = text;
      if (attachments && attachments.length > 0) {
          promptMsg = `📎 [${attachments.length} attachment(s)]\n${text}`;
      }
      setHistory(prev => [...prev, { role: 'user', text: promptMsg }]);
      setMode('CONVERSATION');
    }, 400); // 400ms delay to let the pulse travel up visually
  };

  const handleConfirmResponse = (confirmed: boolean) => {
    if (!confirmRequest) return;
    wsService.send({
      type: 'confirm_action',
      payload: { executionId: confirmRequest.executionId, confirmed }
    });
    setConfirmRequest(null);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Action Toasts Overlay */}
      <div style={{ position: 'absolute', top: '50px', right: '20px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {actionToasts.map(toast => (
          <div key={toast.id} style={{ background: 'rgba(0,255,100,0.1)', border: '1px solid rgba(0,255,100,0.3)', color: '#0f0', padding: '10px 15px', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'monospace' }}>
            {toast.text}
          </div>
        ))}
      </div>

      {/* Confirm Dialog Overlay */}
      {confirmRequest && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-highlight)', borderRadius: '12px', padding: '24px', maxWidth: '400px', width: '90%', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color: '#ff4444', marginBottom: '16px' }}>CONFIRMATION REQUIRED</h3>
            <p style={{ color: 'var(--text-main)', marginBottom: '12px', fontSize: '0.9rem' }}>
              ARVON wants to execute a Tier 3 high-impact action:
            </p>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '24px', overflowWrap: 'break-word' }}>
              Tool: {confirmRequest.details.toolName} <br/>
              Args: {JSON.stringify(confirmRequest.details.args)}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={() => handleConfirmResponse(false)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-dim)' }}>DECLINE</button>
              <button onClick={() => handleConfirmResponse(true)} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', background: '#ff4444', color: '#fff', fontWeight: 'bold' }}>AUTHORIZE</button>
            </div>
          </div>
        </div>
      )}

      {rippleActive && (
        <div className="arvon-ripple-pulse" style={{
          position: 'absolute',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '2px',
          height: '2px',
          borderRadius: '50%',
          boxShadow: '0 0 50px 20px var(--core-active)',
          zIndex: 15,
          animation: 'rippleTravel 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }} />
      )}

      <NeuralField isActive={coreState !== 'IDLE'} />

      <div style={{ 
        height: '40px', 
        WebkitAppRegion: 'drag', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 100
      } as any}>
        <div style={{ fontSize: '0.8rem', letterSpacing: '0.2em', color: 'var(--text-dim)' }}>
          ARVON {wsStatus === 'connected' ? '● ONLINE' : '○ OFFLINE'}
        </div>
        <div style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button onClick={() => setIsSettingsOpen(true)} style={{ color: 'var(--text-dim)' }}>⚙️ Diagnostics</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', zIndex: 10, position: 'relative', minHeight: 0 }}>
        
        {mode === 'INITIALIZING' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.5rem', letterSpacing: '0.6em', color: 'var(--text-main)', marginBottom: '40px', fontWeight: 300 }}>ARVON</div>
            
            <div style={{ width: '60px', height: '60px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--core-active)', animation: 'spin 1s linear infinite', marginBottom: '40px' }} />
            
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.3em', color: 'var(--text-dim)' }}>INITIALIZING CORE...</div>
          </div>
        )}

        {mode === 'CORE' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.5rem', letterSpacing: '0.6em', color: 'var(--text-main)', marginBottom: '60px', fontWeight: 300 }}>ARVON</div>
            
            <IntelligenceCore state={coreState} details={coreDetails} isSpeaking={isSpeaking} audioLevel={audioLevel} />
            
            <div style={{ marginTop: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.3em', color: 'var(--text-dim)' }}>INTELLIGENCE ONLINE</div>
              <div style={{ fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--core-active)' }}>READY</div>
            </div>

            <div style={{ marginTop: '60px', width: '100%', display: 'flex', justifyContent: 'center' }}>
               <CommandBar 
                 onSend={handleSendText} 
                 disabled={wsStatus !== 'connected' && coreState !== 'RESPONDING'} 
                 speechEnabled={speechEnabled} 
                 onToggleSpeech={handleToggleSpeech} 
                 isGenerating={coreState !== 'IDLE'}
                 onInterrupt={() => {
                     window.speechSynthesis.cancel();
                     setIsSpeaking(false);
                     wsService.send({ type: 'interrupt', payload: {} });
                     setCoreState('IDLE');
                 }}
                 voiceProb={voiceProb}
               />
            </div>
          </div>
        )}

        {mode === 'FOCUS' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <IntelligenceCore state={coreState} details={coreDetails} size={150} isSpeaking={isSpeaking} audioLevel={audioLevel} />
            <div style={{ marginTop: '60px', width: '100%', display: 'flex', justifyContent: 'center' }}>
               <CommandBar 
                 onSend={handleSendText} 
                 disabled={wsStatus !== 'connected' && coreState !== 'RESPONDING'} 
                 speechEnabled={speechEnabled} 
                 onToggleSpeech={handleToggleSpeech} 
                 isGenerating={coreState !== 'IDLE'}
                 onInterrupt={() => {
                     window.speechSynthesis.cancel();
                     setIsSpeaking(false);
                     wsService.send({ type: 'interrupt', payload: {} });
                     setCoreState('IDLE');
                 }}
                 voiceProb={voiceProb}
               />
            </div>
          </div>
        )}

        {mode === 'KNOWLEDGE' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2 style={{ color: 'var(--text-main)', letterSpacing: '0.2em', marginBottom: '40px' }}>KNOWLEDGE & MEMORY</h2>
            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '30px', borderRadius: '12px', border: '1px solid var(--border-subtle)', maxWidth: '600px', width: '100%' }}>
              <h3 style={{ color: 'var(--text-dim)', marginBottom: '20px' }}>Connected Sources</h3>
              <ul style={{ color: 'var(--text-main)', listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                 <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ color: 'var(--core-active)' }}>●</span> System Knowledge</li>
                 <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ color: 'var(--text-dim)' }}>○</span> Web Knowledge (Offline)</li>
                 <li style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><span style={{ color: 'var(--text-dim)' }}>○</span> Local Documents (Unconfigured)</li>
              </ul>
              <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'center' }}>
                 <button onClick={() => setMode('CORE')} style={{ color: 'var(--core-active)', padding: '10px 20px', border: '1px solid var(--core-active)', borderRadius: '20px' }}>Return to Core</button>
              </div>
            </div>
          </div>
        )}

        {mode === 'CONVERSATION' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto', width: '100%', minHeight: 0 }}>
            
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
              <IntelligenceCore state={coreState} details={coreDetails} size={100} isSpeaking={isSpeaking} audioLevel={audioLevel} />
            </div>

            <div className="arvon-glass" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px' }}>
              {history.map((msg, i) => (
                <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  {msg.role === 'user' ? (
                     <div style={{ background: 'rgba(255,255,255,0.1)', padding: '12px 16px', borderRadius: '16px 16px 0 16px' }}>
                       {msg.text}
                     </div>
                  ) : (
                     <ResponseRenderer format={msg.format} text={msg.text} metadata={msg.metadata} />
                  )}
                </div>
              ))}
              <div ref={historyEndRef} />
            </div>

            {confirmRequest && (
              <div style={{ background: 'rgba(255, 0, 0, 0.1)', border: '1px solid #ff4444', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <h3 style={{ color: '#ff4444', marginTop: 0 }}>Action Requires Confirmation</h3>
                <p style={{ color: 'var(--text-main)', fontSize: '0.9rem', marginBottom: '10px' }}>
                  <strong>Tool:</strong> {confirmRequest.details.toolName}
                </p>
                <pre style={{ background: '#000', padding: '10px', borderRadius: '4px', fontSize: '0.85rem', color: '#00ff00', overflowX: 'auto', margin: '0 0 15px 0' }}>
                  {JSON.stringify(confirmRequest.details.args, null, 2)}
                </pre>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => {
                        wsService.send({ type: 'confirm_action', payload: { executionId: confirmRequest.executionId, confirmed: true } });
                        setConfirmRequest(null);
                    }}
                    style={{ flex: 1, padding: '10px', background: '#ff4444', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >APPROVE</button>
                  <button 
                    onClick={() => {
                        wsService.send({ type: 'confirm_action', payload: { executionId: confirmRequest.executionId, confirmed: false } });
                        setConfirmRequest(null);
                    }}
                    style={{ flex: 1, padding: '10px', background: 'transparent', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >REJECT</button>
                </div>
              </div>
            )}

            <div style={{ paddingBottom: '20px' }}>
              <CommandBar 
                 onSend={handleSendText} 
                 disabled={wsStatus !== 'connected' && coreState !== 'RESPONDING'} 
                 speechEnabled={speechEnabled} 
                 onToggleSpeech={handleToggleSpeech} 
                 isGenerating={coreState !== 'IDLE'}
                 onInterrupt={() => {
                     window.speechSynthesis.cancel();
                     setIsSpeaking(false);
                     wsService.send({ type: 'interrupt', payload: {} });
                     setCoreState('IDLE');
                 }}
                 voiceProb={voiceProb}
              />
            </div>
          </div>
        )}

      </div>

      {isSettingsOpen && <SidePanel onClose={() => setIsSettingsOpen(false)} animationLevel={animationLevel} setAnimationLevel={setAnimationLevel} speechEnabled={speechEnabled} setSpeechEnabled={setSpeechEnabled} simulateTtsFailure={simulateTtsFailure} setSimulateTtsFailure={setSimulateTtsFailure} theme={theme} setTheme={setTheme} />}

      {showCommandPalette && (
        <div style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', border: '1px solid var(--border-subtle)',
          padding: '20px', borderRadius: '12px', zIndex: 1000, width: '400px', display: 'flex', flexDirection: 'column', gap: '10px'
        }}>
           <div style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Jump to...</div>
           {['CORE', 'FOCUS', 'KNOWLEDGE', 'CONVERSATION'].map(m => (
             <button 
               key={m}
               onClick={() => { setMode(m as any); setShowCommandPalette(false); }}
               style={{
                 background: mode === m ? 'var(--core-active)' : 'rgba(255,255,255,0.05)',
                 color: mode === m ? '#000' : 'var(--text-main)',
                 border: 'none', padding: '12px 15px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                 fontWeight: 'bold', display: 'flex', justifyContent: 'space-between'
               }}
             >
               {m} {mode === m && '✓'}
             </button>
           ))}
           <button 
               onClick={() => { setIsSettingsOpen(true); setShowCommandPalette(false); }}
               style={{
                 background: 'rgba(255,255,255,0.05)',
                 color: 'var(--text-main)',
                 border: 'none', padding: '12px 15px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                 fontWeight: 'bold'
               }}
             >
               SETTINGS
           </button>
        </div>
      )}
    </div>
  );
}

export default App;
