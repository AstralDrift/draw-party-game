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
    // Intrinsic 256px; `.qr` in CSS scales display size for TV WebViews.
    void QRCode.toCanvas(canvas, url, {
      width: 256,
      margin: 1,
      color: { dark: '#1d1d1f', light: '#ffffff' }
    });
  }, [url]);

  return <canvas ref={canvasRef} className="qr" />;
}
