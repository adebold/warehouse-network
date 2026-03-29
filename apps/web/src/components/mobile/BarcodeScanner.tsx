/**
 * Barcode Scanner Component
 * Provides mobile camera-based barcode scanning functionality
 */
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, Flashlight, FlashlightOff, RotateCcw, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface BarcodeScannerProps {
  onScanSuccess: (data: string, format: string) => void;
  onClose: () => void;
  allowedFormats?: string[];
  showOverlay?: boolean;
  continuous?: boolean;
  className?: string;
}

interface ScanResult {
  data: string;
  format: string;
  timestamp: number;
}

export function BarcodeScanner({
  onScanSuccess,
  onClose,
  allowedFormats = ['CODE128', 'CODE39', 'EAN13', 'EAN8', 'QR_CODE'],
  showOverlay = true,
  continuous = false,
  className
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);

  // Initialize camera and scanner
  useEffect(() => {
    initializeScanner();
    return cleanup;
  }, [facingMode]);

  const initializeScanner = async () => {
    try {
      setError(null);

      // Check if scanner libraries are available
      if (typeof window === 'undefined') {
        throw new Error('Scanner not available on server');
      }

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();

        videoRef.current.onloadedmetadata = () => {
          startScanning();
        };
      }

    } catch (error) {
      console.error('Scanner initialization failed:', error);
      setHasPermission(false);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to access camera. Please check permissions.'
      );
    }
  };

  const startScanning = () => {
    if (!continuous && isScanning) return;

    setIsScanning(true);

    scanIntervalRef.current = setInterval(() => {
      scanFrame();
    }, 200); // Scan every 200ms
  };

  const stopScanning = () => {
    setIsScanning(false);

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data for scanning
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Simulate barcode detection (in a real implementation, you'd use a library like QuaggaJS or ZXing)
    // This is a placeholder for the actual scanning logic
    scanImageData(imageData);
  }, []);

  const scanImageData = (imageData: ImageData) => {
    // Placeholder scanning logic
    // In production, integrate with libraries like:
    // - QuaggaJS for 1D barcodes
    // - jsQR for QR codes
    // - ZXing-js for comprehensive barcode support

    // Simulated scan result for demo purposes
    if (Math.random() < 0.01) { // 1% chance per frame for demo
      const mockBarcodes = [
        { data: '1234567890123', format: 'EAN13' },
        { data: 'WAREHOUSE001', format: 'CODE128' },
        { data: 'https://skidspace.com/item/abc123', format: 'QR_CODE' }
      ];

      const result = mockBarcodes[Math.floor(Math.random() * mockBarcodes.length)];
      handleScanResult(result.data, result.format);
    }
  };

  const handleScanResult = (data: string, format: string) => {
    const result: ScanResult = {
      data,
      format,
      timestamp: Date.now()
    };

    // Avoid duplicate scans within 2 seconds
    if (lastScan && lastScan.data === data && (Date.now() - lastScan.timestamp) < 2000) {
      return;
    }

    setLastScan(result);
    setScanHistory(prev => [result, ...prev.slice(0, 9)]); // Keep last 10 scans

    // Provide haptic feedback if available
    if ('vibrate' in navigator) {
      navigator.vibrate(200);
    }

    // Stop scanning if not continuous
    if (!continuous) {
      stopScanning();
    }

    onScanSuccess(data, format);
  };

  const toggleFlash = async () => {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
          await track.applyConstraints({
            advanced: [{ torch: !flashEnabled } as any]
          });
          setFlashEnabled(!flashEnabled);
        } else {
          setError('Flash not supported on this device');
        }
      }
    } catch (error) {
      console.error('Flash toggle failed:', error);
      setError('Failed to toggle flash');
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const cleanup = () => {
    stopScanning();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Permission denied
  if (hasPermission === false) {
    return (
      <Card className={cn("w-full max-w-md mx-auto", className)}>
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
          <h3 className="text-lg font-semibold mb-2">Camera Permission Required</h3>
          <p className="text-muted-foreground mb-4">
            Please allow camera access to use the barcode scanner.
          </p>
          <div className="space-y-2">
            <Button onClick={initializeScanner} className="w-full">
              Try Again
            </Button>
            <Button variant="outline" onClick={onClose} className="w-full">
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("relative w-full h-full bg-black", className)}>
      {/* Video Stream */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
      />

      {/* Hidden canvas for image processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Overlay */}
      {showOverlay && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Scanning guide */}
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="relative w-64 h-64 border-2 border-white rounded-lg">
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-lg" />

              {/* Scanning line animation */}
              {isScanning && (
                <div className="absolute w-full h-0.5 bg-primary animate-pulse">
                  <div className="w-full h-full bg-gradient-to-r from-transparent via-primary to-transparent animate-bounce" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-auto">
        <Button
          variant="secondary"
          size="sm"
          onClick={onClose}
          className="bg-black/50 text-white hover:bg-black/70"
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={switchCamera}
            className="bg-black/50 text-white hover:bg-black/70"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={toggleFlash}
            className="bg-black/50 text-white hover:bg-black/70"
          >
            {flashEnabled ? (
              <FlashlightOff className="w-4 h-4" />
            ) : (
              <Flashlight className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Status Messages */}
      <div className="absolute bottom-4 left-4 right-4 pointer-events-auto space-y-2">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {lastScan && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Scanned: {lastScan.data} ({lastScan.format})
            </AlertDescription>
          </Alert>
        )}

        <div className="text-center">
          <p className="text-white text-sm bg-black/50 rounded px-3 py-1 inline-block">
            {isScanning ? 'Scanning...' : 'Position barcode within the frame'}
          </p>
        </div>
      </div>

      {/* Scan History (for continuous mode) */}
      {continuous && scanHistory.length > 0 && (
        <div className="absolute top-16 right-4 w-48 bg-black/80 rounded-lg p-2 pointer-events-auto">
          <h4 className="text-white text-xs font-semibold mb-2">Recent Scans</h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {scanHistory.slice(0, 5).map((scan, index) => (
              <div key={index} className="text-white text-xs p-1 bg-white/10 rounded">
                <div className="font-mono">{scan.data.slice(0, 20)}...</div>
                <div className="text-gray-300">{scan.format}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default BarcodeScanner;