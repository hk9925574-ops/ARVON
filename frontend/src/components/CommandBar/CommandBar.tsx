import React, { useState, useEffect, useRef } from 'react';
import './CommandBar.css';

interface Props {
  onSend: (text: string, attachments?: {name: string, mimeType: string, data: string}[]) => void;
  disabled: boolean;
  intentHint?: string;
  speechEnabled?: boolean;
  onToggleSpeech?: () => void;
}

export const CommandBar: React.FC<Props> = ({ onSend, disabled, intentHint, speechEnabled, onToggleSpeech }) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [attachments, setAttachments] = useState<{name: string, mimeType: string, data: string}[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSend = () => {
    if ((!input.trim() && attachments.length === 0) || disabled) return;
    onSend(input, attachments);
    setInput('');
    setAttachments([]);
    if (inputRef.current) {
      (inputRef.current as HTMLElement).style.height = 'auto';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (ev.target?.result) {
             setAttachments(prev => [...prev, {
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                data: ev.target!.result as string
             }]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getPlaceholder = () => {
    if (intentHint === 'coding') return 'Write Python, debug, or refactor...';
    if (intentHint === 'question') return 'Ask anything...';
    if (intentHint === 'memory') return 'Tell ARVON what to remember...';
    return 'Ask ARVON anything... (Ctrl+K)';
  };

  const getSuggestions = () => {
    if (intentHint === 'coding') return ['Explain simply', 'Give example', 'Write code', 'Practice'];
    if (intentHint === 'question') return ['Summarize', 'Give more detail', 'Fact check'];
    if (intentHint === 'memory') return ['What do you remember?', 'Forget last topic', 'Show preferences'];
    return ['Search', 'Code', 'Explain', 'Create']; // Default home suggestions
  };

  return (
    <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
      {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', padding: '0 10px' }}>
              {attachments.map((att, idx) => (
                  <div key={idx} style={{ background: 'rgba(255,255,255,0.1)', padding: '5px 10px', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.2)' }}>
                      📎 {att.name}
                      <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: 0 }}>×</button>
                  </div>
              ))}
          </div>
      )}
      <div className={`command-bar-container ${isFocused ? 'focused' : ''}`}>
        <input type="file" multiple ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
        <button className="attachment-btn" title="Attach file" onClick={() => fileInputRef.current?.click()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>

        <textarea
          ref={inputRef as any}
          className="command-input"
          placeholder={getPlaceholder()}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // Auto-resize
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
            if (e.key === 'Escape') inputRef.current?.blur();
          }}
          disabled={disabled}
          rows={1}
          style={{ resize: 'none', overflowY: 'auto' }}
        />

        {onToggleSpeech && (
          <button 
            className="speech-toggle-btn" 
            onClick={(e) => { e.preventDefault(); onToggleSpeech(); }}
            title={speechEnabled ? "Speech Output: ON" : "Speech Output: OFF"}
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: speechEnabled ? 'var(--core-active)' : 'var(--text-dim)',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s'
            }}
          >
            {speechEnabled ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            )}
          </button>
        )}

        {input && (
          <button className="clear-btn" onMouseDown={(e) => { e.preventDefault(); setInput(''); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        )}

        <button 
          className="send-btn" 
          onClick={handleSend}
          disabled={(!input.trim() && attachments.length === 0) || disabled}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      <div className={`command-suggestions ${!input ? 'visible' : ''}`}>
        {getSuggestions().map((sug) => (
          <button 
            key={sug} 
            className="suggestion-chip"
            onMouseDown={(e) => {
              e.preventDefault(); // prevent blur
              onSend(sug);
              setInput('');
            }}
          >
            {sug}
          </button>
        ))}
      </div>
    </div>
  );
};
