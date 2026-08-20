import React, { useEffect, useRef } from 'react';

interface NeuralNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseRadius: number;
  pulseOffset: number;
}

export const NeuralField: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<NeuralNode[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // Performance: fewer nodes on reduced motion or just standard count
    const nodeCount = isReducedMotion ? 20 : 60;
    const connectionDist = 150;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // Initialize nodes
    if (nodesRef.current.length === 0) {
      for (let i = 0; i < nodeCount; i++) {
        nodesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          baseRadius: Math.random() * 2 + 1,
          pulseOffset: Math.random() * Math.PI * 2
        });
      }
    }

    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.01;

      const speedMultiplier = isActive && !isReducedMotion ? 2.5 : 0.5;

      // Update and draw nodes
      nodesRef.current.forEach(node => {
        node.x += node.vx * speedMultiplier;
        node.y += node.vy * speedMultiplier;

        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;

        // Draw connections
        nodesRef.current.forEach(other => {
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist < connectionDist) {
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            const alpha = (1 - dist / connectionDist) * (isActive ? 0.3 : 0.1);
            ctx.strokeStyle = `rgba(150, 180, 255, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });

        // Draw node
        const pulse = Math.sin(time * 2 + node.pulseOffset) * 0.5 + 0.5;
        const radius = node.baseRadius + (isActive ? pulse * 2 : 0);
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? `rgba(200, 220, 255, ${0.4 + pulse * 0.4})` : `rgba(100, 120, 150, 0.3)`;
        ctx.fill();
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, [isActive]);

  return (
    <canvas 
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  );
};
