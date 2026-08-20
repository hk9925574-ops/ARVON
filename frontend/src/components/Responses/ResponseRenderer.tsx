import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/atom-one-dark.css'; // or any highlight.js theme
import './ResponseRenderer.css';

interface Props {
  format?: string;
  text: string;
  metadata?: any;
}

export const ResponseRenderer: React.FC<Props> = ({ format = 'TEXT', text, metadata }) => {
  const renderFreshness = () => {
      if (!metadata || !metadata.freshness) return null;
      const isVerified = metadata.freshness.includes('Verified');
      return (
          <div style={{ fontSize: '0.65rem', letterSpacing: '0.05em', color: isVerified ? 'var(--core-active)' : 'var(--text-dim)', marginBottom: '8px', opacity: 0.8 }}>
              {isVerified ? '● ' : '○ '}{metadata.freshness}
          </div>
      );
  };

  if (format === 'TOOL RESULT') {
    return (
      <div className="response-card tool-result-card">
        <div className="card-header">
          <span className="icon">⚙️</span>
          <span>System Result</span>
        </div>
        <div className="card-body">
          {renderFreshness()}
          <pre>{text}</pre>
        </div>
      </div>
    );
  }

  if (format === 'ERROR') {
    return (
      <div className="response-card error-card">
        <div className="card-header">⚠️ Error</div>
        <div className="card-body">{text}</div>
      </div>
    );
  }

  return (
    <div className="response-text">
      {renderFreshness()}
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>
          {text}
      </ReactMarkdown>
    </div>
  );
};
