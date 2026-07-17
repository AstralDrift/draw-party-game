import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  url: string;
}

export function QrCode({ url }: QrCodeProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    void QRCode.toCanvas(canvas, url, {
      width: 640,
      margin: 1,
      color: { dark: '#1d1d1f', light: '#ffffff' }
    }).then(() => {
      canvas.style.width = '';
      canvas.style.height = '';
    });
  }, [url]);

  return <canvas ref={canvasRef} className="qr" />;
}
