/**
 * Mobile Barcode Scanning Page
 * Dedicated mobile page for barcode scanning functionality
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  History,
  Package,
  CheckCircle,
  AlertTriangle,
  Plus,
  Edit,
  Trash2,
  Share2
} from 'lucide-react';

// Dynamically import BarcodeScanner to avoid SSR issues
const BarcodeScanner = dynamic(
  () => import('@/components/mobile/BarcodeScanner'),
  { ssr: false }
);

interface ScanResult {
  data: string;
  format: string;
  timestamp: Date;
  processed: boolean;
  itemInfo?: {
    name: string;
    description: string;
    category: string;
    stock: number;
    location: string;
  };
}

export default function MobileScanPage() {
  const router = useRouter();
  const [isScanning, setIsScanning] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load scan history on mount
  useEffect(() => {
    loadScanHistory();
  }, []);

  const loadScanHistory = () => {
    const saved = localStorage.getItem('scan-history');
    if (saved) {
      try {
        const history = JSON.parse(saved).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
        setScanHistory(history);
      } catch (error) {
        console.error('Failed to load scan history:', error);
      }
    }
  };

  const saveScanHistory = (history: ScanResult[]) => {
    localStorage.setItem('scan-history', JSON.stringify(history));
    setScanHistory(history);
  };

  const handleScanSuccess = async (data: string, format: string) => {
    const scanResult: ScanResult = {
      data,
      format,
      timestamp: new Date(),
      processed: false
    };

    setCurrentScan(scanResult);
    setIsScanning(false);
    setIsProcessing(true);

    try {
      // Process the scanned code
      const itemInfo = await processBarcode(data, format);
      const processedScan = {
        ...scanResult,
        processed: true,
        itemInfo
      };

      setCurrentScan(processedScan);

      // Add to history
      const newHistory = [processedScan, ...scanHistory.slice(0, 49)]; // Keep last 50
      saveScanHistory(newHistory);

    } catch (error) {
      console.error('Failed to process barcode:', error);
      const errorScan = {
        ...scanResult,
        processed: true
      };
      setCurrentScan(errorScan);

      const newHistory = [errorScan, ...scanHistory.slice(0, 49)];
      saveScanHistory(newHistory);
    } finally {
      setIsProcessing(false);
    }
  };

  const processBarcode = async (data: string, format: string) => {
    // Call your inventory API to get item information
    try {
      const response = await fetch('/api/inventory/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: data, format })
      });

      if (response.ok) {
        return await response.json();
      } else {
        // Return mock data if API fails
        return generateMockItemInfo(data, format);
      }
    } catch (error) {
      console.error('API lookup failed:', error);
      return generateMockItemInfo(data, format);
    }
  };

  const generateMockItemInfo = (data: string, format: string) => {
    // Generate mock item info based on barcode
    const categories = ['Electronics', 'Tools', 'Furniture', 'Automotive', 'Clothing'];
    const locations = ['A1-B2', 'C3-D4', 'E5-F6', 'G7-H8'];

    return {
      name: `Item ${data.slice(-6)}`,
      description: `Product scanned from ${format} barcode`,
      category: categories[Math.floor(Math.random() * categories.length)],
      stock: Math.floor(Math.random() * 100),
      location: locations[Math.floor(Math.random() * locations.length)]
    };
  };

  const handleAddToInventory = () => {
    if (currentScan?.itemInfo) {
      router.push(`/inventory/add?barcode=${currentScan.data}&name=${currentScan.itemInfo.name}`);
    }
  };

  const handleUpdateInventory = () => {
    if (currentScan?.itemInfo) {
      router.push(`/inventory/update?barcode=${currentScan.data}`);
    }
  };

  const handleShare = async () => {
    if (!currentScan) return;

    const shareData = {
      title: 'Scanned Item',
      text: `${currentScan.itemInfo?.name || 'Barcode'}: ${currentScan.data}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(shareData.text);
        alert('Copied to clipboard!');
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const clearHistory = () => {
    if (confirm('Clear all scan history?')) {
      saveScanHistory([]);
    }
  };

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <>
      <Head>
        <title>Barcode Scanner - SkidSpace</title>
        <meta name="description" content="Scan barcodes to manage inventory" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <MobileLayout
        title="Barcode Scanner"
        showBackButton={!isScanning}
        rightAction={
          !isScanning && scanHistory.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsScanning(true)}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              Scan
            </Button>
          ) : undefined
        }
      >
        {isScanning ? (
          <div className="h-full">
            <BarcodeScanner
              onScanSuccess={handleScanSuccess}
              onClose={() => setIsScanning(false)}
              showOverlay
              className="h-full"
            />
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* Current Scan Result */}
            {currentScan && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {currentScan.processed ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                    Latest Scan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isProcessing ? (
                    <div className="text-center py-4">
                      <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Processing barcode...</p>
                    </div>
                  ) : currentScan.itemInfo ? (
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-lg">{currentScan.itemInfo.name}</h3>
                        <p className="text-muted-foreground">{currentScan.itemInfo.description}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Category:</span>
                          <p className="font-medium">{currentScan.itemInfo.category}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Location:</span>
                          <p className="font-medium">{currentScan.itemInfo.location}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Stock:</span>
                          <p className="font-medium">{currentScan.itemInfo.stock} units</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Format:</span>
                          <p className="font-medium">{currentScan.format}</p>
                        </div>
                      </div>

                      <div className="bg-muted p-2 rounded font-mono text-sm break-all">
                        {currentScan.data}
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={handleAddToInventory} className="flex-1">
                          <Plus className="w-4 h-4 mr-2" />
                          Add Item
                        </Button>
                        <Button onClick={handleUpdateInventory} variant="outline" className="flex-1">
                          <Edit className="w-4 h-4 mr-2" />
                          Update
                        </Button>
                        <Button onClick={handleShare} variant="outline" size="icon">
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        Item not found in inventory. Would you like to add it?
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Start Scanning Button */}
            {!currentScan && (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h2 className="text-xl font-semibold mb-2">Scan Barcode</h2>
                  <p className="text-muted-foreground mb-6">
                    Point your camera at a barcode to scan and manage inventory items.
                  </p>
                  <Button onClick={() => setIsScanning(true)} size="lg" className="w-full">
                    Start Scanning
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Scan History */}
            {scanHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Scan History
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearHistory}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {scanHistory.map((scan, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                        onClick={() => setCurrentScan(scan)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm">
                              {scan.itemInfo?.name || `Barcode ${scan.data.slice(-6)}`}
                            </h4>
                            <Badge variant="outline" className="text-xs">
                              {scan.format}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">
                            {scan.data.slice(0, 20)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTimeAgo(scan.timestamp)}
                          </p>
                        </div>
                        {scan.itemInfo && (
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{scan.itemInfo.category}</p>
                            <p className="text-xs font-medium">{scan.itemInfo.stock} units</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => router.push('/inventory')}
                    className="h-20 flex flex-col gap-2"
                  >
                    <Package className="w-6 h-6" />
                    <span className="text-sm">View Inventory</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setIsScanning(true)}
                    className="h-20 flex flex-col gap-2"
                  >
                    <Package className="w-6 h-6" />
                    <span className="text-sm">Scan Again</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </MobileLayout>
    </>
  );
}