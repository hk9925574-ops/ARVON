import { useState, useEffect } from 'react';
import './Settings.css';

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const [startWithWindows, setStartWithWindows] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [globalHotkey, setGlobalHotkey] = useState('Ctrl+Space');
  const [activeTab, setActiveTab] = useState('GENERAL');

  useEffect(() => {
    // Load settings from local storage or IPC
    const loadSettings = async () => {
      // In a real Electron app, we'd query the main process here
      // For now, load from localStorage if available
      const saved = localStorage.getItem('arvon_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        setStartWithWindows(parsed.startWithWindows || false);
        setMinimizeToTray(parsed.minimizeToTray !== false);
        setGlobalHotkey(parsed.globalHotkey || 'Ctrl+Space');
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    const settings = { startWithWindows, minimizeToTray, globalHotkey };
    localStorage.setItem('arvon_settings', JSON.stringify(settings));
    
    // Notify Electron main process via IPC if available
    // @ts-ignore
    if (window.electronAPI) {
      // @ts-ignore
      await window.electronAPI.updateSettings(settings);
    }
    
    onClose();
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal glass-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose}>✕</button>
        </div>
        
        <div className="settings-body">
          <div className="settings-sidebar">
            <button className={activeTab === 'GENERAL' ? 'active' : ''} onClick={() => setActiveTab('GENERAL')}>General</button>
            <button className={activeTab === 'VOICE' ? 'active' : ''} onClick={() => setActiveTab('VOICE')}>Voice</button>
            <button className={activeTab === 'APPEARANCE' ? 'active' : ''} onClick={() => setActiveTab('APPEARANCE')}>Appearance</button>
            <button className={activeTab === 'ABOUT' ? 'active' : ''} onClick={() => setActiveTab('ABOUT')}>About</button>
          </div>
          
          <div className="settings-content">
            {activeTab === 'GENERAL' && (
              <div className="settings-section">
                <h3>System Integration</h3>
                
                <label className="toggle-label">
                  <div>
                    <strong>Start with Windows</strong>
                    <div className="text-muted">Launch ARVON silently when you log in</div>
                  </div>
                  <input type="checkbox" checked={startWithWindows} onChange={(e) => setStartWithWindows(e.target.checked)} />
                </label>
                
                <label className="toggle-label">
                  <div>
                    <strong>Minimize to Tray</strong>
                    <div className="text-muted">Keep ARVON running in the background when window is closed</div>
                  </div>
                  <input type="checkbox" checked={minimizeToTray} onChange={(e) => setMinimizeToTray(e.target.checked)} />
                </label>

                <label className="input-label" style={{ marginTop: '20px' }}>
                  <strong>Global Shortcut</strong>
                  <div className="text-muted" style={{ marginBottom: '8px' }}>Press to wake ARVON from anywhere</div>
                  <input type="text" value={globalHotkey} onChange={(e) => setGlobalHotkey(e.target.value)} />
                </label>
              </div>
            )}
            
            {activeTab === 'VOICE' && (
              <div className="settings-section">
                <h3>Voice Engine</h3>
                <p className="text-muted">Coming soon: Adjust microphone sensitivity, wake word thresholds, and TTS voices.</p>
              </div>
            )}

            {activeTab === 'APPEARANCE' && (
              <div className="settings-section">
                <h3>Visuals</h3>
                <p className="text-muted">Coming soon: Mini mode toggle, color themes.</p>
              </div>
            )}

            {activeTab === 'ABOUT' && (
              <div className="settings-section" style={{ textAlign: 'center', paddingTop: '20px' }}>
                <h1 style={{ letterSpacing: '2px' }}>ARVON</h1>
                <p>Desktop AI Assistant</p>
                <p className="text-muted" style={{ marginTop: '10px' }}>Version 1.0.0-alpha</p>
                <p className="text-muted" style={{ marginTop: '20px' }}>Zero-cost local inference engine.</p>
              </div>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <button onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={handleSave}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}
