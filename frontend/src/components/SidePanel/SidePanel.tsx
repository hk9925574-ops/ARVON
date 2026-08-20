import React, { useState, useEffect } from 'react';
import { wsService } from '../../services/websocket';

interface Props {
  onClose: () => void;
  animationLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  setAnimationLevel: (level: 'LOW' | 'MEDIUM' | 'HIGH') => void;
  speechEnabled: boolean;
  setSpeechEnabled: (val: boolean) => void;
  simulateTtsFailure: boolean;
  setSimulateTtsFailure: (val: boolean) => void;
}

type Tab = 'CONVERSATIONS' | 'MEMORY' | 'AGENTS' | 'TERMINAL' | 'TOOLS' | 'KNOWLEDGE' | 'SETTINGS';

export const SidePanel: React.FC<Props> = ({ 
  onClose, 
  animationLevel, 
  setAnimationLevel,
  speechEnabled,
  setSpeechEnabled,
  simulateTtsFailure,
  setSimulateTtsFailure
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('SETTINGS');
  const [memories, setMemories] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<string>('');

  useEffect(() => {
    // Request memories when opened
    wsService.send({ type: 'get_vector_memories', payload: {} });
    
    let agentPoll: any;
    if (activeTab === 'AGENTS') {
        wsService.send({ type: 'get_agents', payload: {} });
        agentPoll = setInterval(() => wsService.send({ type: 'get_agents', payload: {} }), 2000);
    }

    const unsubscribe = wsService.onMessage((msg) => {
      if (msg.type === 'vector_memories_list') {
        setMemories(msg.payload || []);
      } else if (msg.type === 'active_agents_list') {
        setAgents(msg.payload || []);
      } else if (msg.type === 'terminal_output') {
        setTerminalLogs(prev => prev + msg.payload.chunk);
      }
    });

    return () => { 
        unsubscribe(); 
        if (agentPoll) clearInterval(agentPoll);
    };
  }, [activeTab]);

  return (
    <div className="arvon-glass-panel" style={{
      position: 'absolute',
      right: '20px',
      top: '80px',
      bottom: '20px',
      width: '400px',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slideInRight 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
    }}>
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.1rem', letterSpacing: '0.1em' }}>{activeTab}</h2>
        <button onClick={onClose} style={{ color: 'var(--text-dim)', fontSize: '1.2rem' }}>×</button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', padding: '0 10px' }}>
        {(['CONVERSATIONS', 'MEMORY', 'AGENTS', 'TERMINAL', 'TOOLS', 'KNOWLEDGE', 'SETTINGS'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '12px 15px',
              color: activeTab === tab ? 'var(--core-active)' : 'var(--text-dim)',
              borderBottom: activeTab === tab ? '2px solid var(--core-active)' : '2px solid transparent',
              fontSize: '0.75rem',
              letterSpacing: '0.05em'
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      
      <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
        {activeTab === 'CONVERSATIONS' && (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            No previous conversations found.
          </div>
        )}

        {activeTab === 'MEMORY' && (
          <div>
            {memories.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '15px' }}>No active memories.</div>
            ) : (
              memories.map((m, i) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', marginBottom: '15px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{m.text}</div>
                  <div style={{ color: 'var(--text-dim)' }}>[{m.metadata?.category || 'general'}] {new Date(m.timestamp).toLocaleDateString()}</div>
                  <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => wsService.send({ type: 'forget_vector_memory', payload: { id: m.id } })}
                      style={{ color: 'var(--text-dim)' }}
                    >Forget</button>
                  </div>
                </div>
              ))
            )}
            {memories.length > 0 && (
               <button 
                 onClick={() => wsService.send({ type: 'clear_vector_memories', payload: {} })}
                 style={{ color: '#ff6b6b', fontSize: '0.85rem' }}
               >Clear All Memory</button>
            )}
          </div>
        )}

        {activeTab === 'AGENTS' && (
          <div>
            {agents.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>No active background agents.</div>
            ) : (
              agents.map((a, i) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-subtle)', fontSize: '0.9rem', marginBottom: '15px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{a.id}</span>
                    <span style={{ color: a.status === 'Running' ? 'var(--core-active)' : (a.status === 'Error' ? '#ff6b6b' : '#4caf50') }}>{a.status}</span>
                  </div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '10px' }}>{a.task}</div>
                  <div style={{ background: '#000', padding: '10px', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-dim)', maxHeight: '150px', overflowY: 'auto' }}>
                    {a.logs.map((l: string, li: number) => <div key={li}>{l}</div>)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'TERMINAL' && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, background: '#000', padding: '15px', borderRadius: '8px', color: '#00ff00', fontFamily: 'monospace', fontSize: '0.85rem', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {terminalLogs || <span style={{ color: 'var(--text-dim)' }}>Waiting for terminal output...</span>}
            </div>
            <button 
                onClick={() => setTerminalLogs('')}
                style={{ marginTop: '10px', alignSelf: 'flex-end', color: 'var(--text-dim)', fontSize: '0.8rem' }}
            >
                Clear Terminal
            </button>
          </div>
        )}

        {activeTab === 'TOOLS' && (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            Active Tools:<br/><br/>
            - System Info (SAFE)<br/>
            - Calculator (SAFE)<br/>
            - File Writer (CONFIRM)
          </div>
        )}

        {activeTab === 'KNOWLEDGE' && (
          <div style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
            System Knowledge: Connected<br/>
            Web Knowledge: Offline<br/>
            Local Documents: Not configured
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Animation Level</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setAnimationLevel('LOW')} style={{ flex: 1, padding: '8px', background: animationLevel === 'LOW' ? 'var(--core-active)' : 'transparent', color: animationLevel === 'LOW' ? '#000' : 'var(--text-main)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>LOW</button>
                <button onClick={() => setAnimationLevel('MEDIUM')} style={{ flex: 1, padding: '8px', background: animationLevel === 'MEDIUM' ? 'var(--core-active)' : 'transparent', color: animationLevel === 'MEDIUM' ? '#000' : 'var(--text-main)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>MEDIUM</button>
                <button onClick={() => setAnimationLevel('HIGH')} style={{ flex: 1, padding: '8px', background: animationLevel === 'HIGH' ? 'var(--core-active)' : 'transparent', color: animationLevel === 'HIGH' ? '#000' : 'var(--text-main)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>HIGH</button>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Speech Output Engine (TTS)</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                <input 
                  type="checkbox" 
                  checked={speechEnabled} 
                  onChange={(e) => setSpeechEnabled(e.target.checked)} 
                />
                Enable Speech Output
              </label>
              
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: 'var(--text-dim)' }}>
                <input 
                  type="checkbox" 
                  checked={simulateTtsFailure} 
                  onChange={(e) => setSimulateTtsFailure(e.target.checked)} 
                />
                Simulate TTS Failure (Diagnostics)
              </label>
            </div>
            
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '10px', color: '#ff6b6b' }}>Danger Zone</div>
              <button style={{ color: '#ff6b6b', background: 'transparent', border: '1px solid #ff6b6b', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Reset ARVON</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
