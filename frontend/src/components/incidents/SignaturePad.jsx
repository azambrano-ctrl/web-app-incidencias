import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';

/**
 * Firma digital usando Canvas puro (sin react-signature-canvas).
 * Expone los métodos: clear(), isEmpty(), toDataURL()
 */
const SignaturePad = forwardRef(function SignaturePad({ onEnd, width = 440, height = 160 }, ref) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const [empty, setEmpty] = useState(true);

  /* Ajustar DPR para pantallas retina */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.offsetWidth  * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
  }, []);

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  function startDraw(e) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw(e) {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
    setEmpty(false);
    onEnd?.();
  }

  /* API pública expuesta al padre via ref */
  useImperativeHandle(ref, () => ({
    clear() {
      const canvas = canvasRef.current;
      const ctx    = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
      setEmpty(true);
    },
    isEmpty() { return empty; },
    toDataURL() { return canvasRef.current?.toDataURL('image/png'); },
  }), [empty]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={startDraw}
      onMouseMove={draw}
      onMouseUp={endDraw}
      onMouseLeave={endDraw}
      onTouchStart={startDraw}
      onTouchMove={draw}
      onTouchEnd={endDraw}
      style={{ width: '100%', height, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
    />
  );
});

export default SignaturePad;
