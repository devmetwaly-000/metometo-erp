"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Camera, 
  RefreshCw, 
  Zap, 
  ZapOff, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  AlertCircle, 
  X,
  Scan,
  Maximize2
} from "lucide-react";

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (barcode: string) => void;
  title?: string;
  defaultContinuous?: boolean;
}

export default function CameraBarcodeScanner({
  isOpen,
  onOpenChange,
  onScan,
  title = "مسح الباركود بكاميرا الموبايل",
  defaultContinuous = true,
}: CameraBarcodeScannerProps) {
  const scannerContainerId = "mobile-camera-barcode-scanner-view";
  
  const [isInitializing, setIsInitializing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [isContinuous, setIsContinuous] = useState(defaultContinuous);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [recentScansCount, setRecentScansCount] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);

  const html5QrCodeRef = useRef<any>(null);
  const stopPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const lastScanTimestampRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>("");
  const pendingCandidateRef = useRef<{ code: string; count: number; ts: number }>({
    code: "",
    count: 0,
    ts: 0,
  });

  // Validate GS1 check digit for EAN-13, EAN-8, and UPC-A
  const isValidGs1CheckDigit = (code: string): boolean => {
    if (!/^\d+$/.test(code)) return false;
    const digits = code.split("").map(Number);
    const checkDigit = digits[digits.length - 1];
    let sum = 0;
    for (let i = digits.length - 2, pos = 1; i >= 0; i--, pos++) {
      sum += digits[i] * (pos % 2 === 1 ? 3 : 1);
    }
    const expected = (10 - (sum % 10)) % 10;
    return checkDigit === expected;
  };

  // Synthesize a crisp retail scanner beep sound via Web Audio API
  const playBeep = useCallback(() => {
    if (!isSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(1450, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio autoplay policy fallback
    }
  }, [isSoundEnabled]);

  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch {}
  }, []);

  // Handle successful scan with check-digit validation and multi-frame consensus
  const handleDecodedText = useCallback(
    (decodedText: string, decodedResult?: any) => {
      if (!decodedText) return;
      const cleanCode = decodedText.trim();
      const now = Date.now();
      const formatName = String(
        decodedResult?.result?.format?.formatName || ""
      ).toUpperCase();

      // 1. Validate GS1 check digit for numeric retail barcodes (EAN-13, EAN-8, UPC-A)
      if (
        (formatName === "EAN_13" || (cleanCode.length === 13 && /^\d{13}$/.test(cleanCode))) &&
        !isValidGs1CheckDigit(cleanCode)
      ) {
        return;
      }
      if (
        (formatName === "EAN_8" || formatName === "UPC_A") &&
        !isValidGs1CheckDigit(cleanCode)
      ) {
        return;
      }

      // 2. Require 2 matching reads within 900ms for 1D barcodes to eliminate blurry single-frame misreads
      const isQr = formatName === "QR_CODE";
      if (!isQr) {
        const pending = pendingCandidateRef.current;
        if (pending.code === cleanCode && now - pending.ts <= 900) {
          pending.count += 1;
          pending.ts = now;
        } else {
          pendingCandidateRef.current = { code: cleanCode, count: 1, ts: now };
          return;
        }
        if (pendingCandidateRef.current.count < 2) {
          return;
        }
        pendingCandidateRef.current = { code: "", count: 0, ts: 0 };
      }

      // 3. Debounce: prevent duplicate scan of the identical code within 1.5 seconds
      if (
        cleanCode === lastScannedCodeRef.current &&
        now - lastScanTimestampRef.current < 1500
      ) {
        return;
      }

      lastScanTimestampRef.current = now;
      lastScannedCodeRef.current = cleanCode;
      setLastScannedCode(cleanCode);
      setRecentScansCount((prev) => prev + 1);

      playBeep();
      triggerHaptic();

      // Dispatch scan to POS / caller
      onScan(cleanCode);

      // If single scan mode, close dialog immediately
      if (!isContinuous) {
        onOpenChange(false);
      }
    },
    [isContinuous, onScan, onOpenChange, playBeep, triggerHaptic]
  );

  const handleDecodedTextRef = useRef(handleDecodedText);
  handleDecodedTextRef.current = handleDecodedText;

  // Toggle flashlight / torch if supported by hardware
  const toggleTorch = async () => {
    if (!html5QrCodeRef.current) return;
    try {
      const newTorchState = !isTorchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: newTorchState }],
      });
      setIsTorchOn(newTorchState);
    } catch (e) {
      console.warn("Torch not supported on this device/camera:", e);
      setHasTorchCapability(false);
    }
  };

  // Switch to next available camera
  const switchCamera = async () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
  };

  // Start the scanner
  useEffect(() => {
    if (!isOpen) {
      setLastScannedCode(null);
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    setIsInitializing(true);
    setErrorMessage(null);
    setHasTorchCapability(false);
    setIsTorchOn(false);

    const initScanner = async () => {
      try {
        // Ensure any previous camera stop has completed before acquiring hardware again
        await stopPromiseRef.current;
        if (!isMounted) return;

        if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "المتصفح يمنع تشغيل الكاميرا على اتصال غير آمن (HTTP). يرجى فتح النظام عبر HTTPS أو localhost."
          );
        }

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode"
        );

        if (!isMounted) return;

        const container = document.getElementById(scannerContainerId);
        if (!container) {
          throw new Error("عنصر عرض الكاميرا غير جاهز");
        }

        const qrCodeInstance = new Html5Qrcode(scannerContainerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });

        html5QrCodeRef.current = qrCodeInstance;

        const config = {
          fps: 20,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.floor(viewfinderWidth * 0.9),
              height: Math.floor(minEdge * 0.48),
            };
          },
          aspectRatio: 1.333334,
        };

        const onDecode = (decodedText: string, decodedResult: any) => {
          handleDecodedTextRef.current(decodedText, decodedResult);
        };
        const onDecodeFailure = () => {};

        // Prefer facingMode ("environment") on mobile so OS chooses the primary rear autofocus lens
        if (selectedCameraId) {
          await qrCodeInstance.start(
            { deviceId: { exact: selectedCameraId } },
            config,
            onDecode,
            onDecodeFailure
          );
        } else {
          try {
            await qrCodeInstance.start(
              { facingMode: "environment" },
              config,
              onDecode,
              onDecodeFailure
            );
          } catch {
            // Fallback for devices without a rear camera (e.g., laptops / front-only tablets)
            try {
              await qrCodeInstance.start(
                { facingMode: "user" },
                config,
                onDecode,
                onDecodeFailure
              );
            } catch {
              const devices = await Html5Qrcode.getCameras();
              if (!devices || devices.length === 0) {
                throw new Error("لم يتم العثور على كاميرا في هذا الجهاز.");
              }
              await qrCodeInstance.start(
                devices[0].id,
                config,
                onDecode,
                onDecodeFailure
              );
            }
          }
        }

        if (!isMounted) {
          try {
            if (qrCodeInstance.isScanning) {
              await qrCodeInstance.stop();
            }
            qrCodeInstance.clear();
          } catch {}
          return;
        }

        setIsInitializing(false);

        // Request HD resolution and continuous autofocus for crisp 1D barcode reading
        try {
          await qrCodeInstance.applyVideoConstraints({
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: "continuous" } as any],
          });
        } catch {}

        // Populate camera list in background for Switch Camera button (without triggering re-init)
        try {
          const devices = await Html5Qrcode.getCameras();
          if (isMounted && devices && devices.length > 0) {
            setCameras(devices.map((d) => ({ id: d.id, label: d.label || "كاميرا" })));
          }
        } catch {}

        // Check torch capability
        try {
          const capabilities = qrCodeInstance.getRunningTrackCapabilities();
          if (capabilities && (capabilities as any).torch) {
            setHasTorchCapability(true);
          }
        } catch {}
      } catch (err: any) {
        if (!isMounted) return;
        setIsInitializing(false);
        const msg = String(err?.message || err || "");
        if (msg.includes("Permission") || msg.includes("denied") || msg.includes("NotAllowedError")) {
          setErrorMessage(
            "تم رفض إذن استخدام الكاميرا من المتصفح. يرجى السماح بالوصول للكاميرا من إعدادات المتصفح."
          );
        } else {
          setErrorMessage(`تعذر تشغيل الكاميرا: ${msg}`);
        }
      }
    };

    const timer = setTimeout(() => {
      initScanner();
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      const instance = html5QrCodeRef.current;
      html5QrCodeRef.current = null;
      if (instance) {
        stopPromiseRef.current = (async () => {
          try {
            if (instance.isScanning) {
              await instance.stop();
            }
            instance.clear();
          } catch {}
        })();
      }
    };
  }, [isOpen, selectedCameraId, retryNonce]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-full p-0 overflow-hidden bg-background border shadow-2xl rounded-2xl max-h-[95vh] flex flex-col">
        
        {/* Header */}
        <DialogHeader className="p-4 pb-2 border-b flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">{title}</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                وجّه كاميرا الموبايل نحو باركود الصنف
              </DialogDescription>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Viewfinder Viewport */}
        <div className="relative flex-1 min-h-[300px] sm:min-h-[360px] bg-black flex items-center justify-center overflow-hidden">
          
          {/* HTML5 QR Container */}
          <div
            id={scannerContainerId}
            className="w-full h-full min-h-[300px] [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
          />

          {/* Scanner Overlay HUD */}
          {!isInitializing && !errorMessage && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              
              {/* Target Frame */}
              <div className="relative w-full max-w-[280px] h-[170px] border-2 border-primary/70 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] flex items-center justify-center">
                
                {/* Laser animation */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-bounce shadow-[0_0_8px_#ef4444]" />
                
                {/* Corner markers */}
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-primary rounded-br-lg" />

                <div className="text-center text-[11px] font-medium text-white/80 bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-sm">
                  ضع الباركود هنا
                </div>
              </div>

              {/* Status Message */}
              {lastScannedCode && (
                <div className="mt-4 pointer-events-auto bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>تم المسح بنجاح: {lastScannedCode}</span>
                </div>
              )}
            </div>
          )}

          {/* Loading State */}
          {isInitializing && (
            <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3 z-20">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm font-semibold text-foreground">جاري تشغيل كاميرا الموبايل...</p>
              <p className="text-xs text-muted-foreground">يرجى الموافقة على إذن الكاميرا عند طلبه</p>
            </div>
          )}

          {/* Error State */}
          {errorMessage && (
            <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center p-6 text-center space-y-4 z-20">
              <AlertCircle className="h-10 w-10 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-destructive">تعذر تشغيل الكاميرا</p>
                <p className="text-xs text-muted-foreground max-w-xs">{errorMessage}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setErrorMessage(null);
                  setIsInitializing(true);
                  setSelectedCameraId(null);
                  setRetryNonce((prev) => prev + 1);
                }}
              >
                إعادة المحاولة
              </Button>
            </div>
          )}

          {/* Floating Controls Toolbar */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10 bg-black/60 backdrop-blur-md p-1 rounded-xl">
            {/* Switch Camera */}
            {cameras.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={switchCamera}
                title="تبديل الكاميرا (أمامية / خلفية)"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}

            {/* Torch Toggle */}
            {hasTorchCapability && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={`h-8 w-8 ${isTorchOn ? "text-amber-400 bg-white/20" : "text-white"} hover:bg-white/20`}
                onClick={toggleTorch}
                title="تشغيل / إيقاف الكشاف"
              >
                {isTorchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
              </Button>
            )}

            {/* Sound Toggle */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${isSoundEnabled ? "text-emerald-400" : "text-white/60"} hover:bg-white/20`}
              onClick={() => setIsSoundEnabled(!isSoundEnabled)}
              title="صوت تأكيد المسح"
            >
              {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Footer Settings & Stats */}
        <DialogFooter className="p-3 bg-muted/40 border-t flex flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="continuous-scan"
              checked={isContinuous}
              onCheckedChange={setIsContinuous}
            />
            <Label htmlFor="continuous-scan" className="text-xs cursor-pointer select-none">
              مسح مستمر للأصناف
            </Label>
          </div>

          <div className="flex items-center gap-2">
            {recentScansCount > 0 && (
              <Badge variant="secondary" className="font-mono text-xs">
                تم مسح {recentScansCount}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={() => onOpenChange(false)}
            >
              إغلاق
            </Button>
          </div>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
