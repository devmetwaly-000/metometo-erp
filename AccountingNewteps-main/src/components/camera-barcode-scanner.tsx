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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const stopPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const lastScanTimestampRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>("");

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

  // Handle successful scan with GS1 check-digit validation
  const handleDecodedText = useCallback(
    (decodedText: string, decodedResult?: any) => {
      if (!decodedText) return;
      const cleanCode = decodedText.trim();
      const now = Date.now();
      const formatName = String(
        decodedResult?.format || decodedResult?.result?.format?.formatName || ""
      ).toUpperCase();

      // Validate GS1 check digit for numeric retail barcodes (EAN-13, EAN-8, UPC-A)
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

      // Debounce: prevent duplicate scan of the identical code within 1.5 seconds
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
    const newTorchState = !isTorchOn;
    try {
      if (mediaStreamRef.current) {
        const track = mediaStreamRef.current.getVideoTracks()[0];
        if (track) {
          await track.applyConstraints({
            advanced: [{ torch: newTorchState } as any],
          });
          setIsTorchOn(newTorchState);
          return;
        }
      }
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.applyVideoConstraints({
          advanced: [{ torch: newTorchState }],
        });
        setIsTorchOn(newTorchState);
      }
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
    let detectInterval: ReturnType<typeof setInterval> | null = null;
    setIsInitializing(true);
    setErrorMessage(null);
    setHasTorchCapability(false);
    setIsTorchOn(false);

    const stopNativeStream = () => {
      if (detectInterval) {
        clearInterval(detectInterval);
        detectInterval = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        mediaStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const initScanner = async () => {
      try {
        await stopPromiseRef.current;
        if (!isMounted) return;

        if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "المتصفح يمنع تشغيل الكاميرا على اتصال غير آمن (HTTP). يرجى فتح النظام عبر HTTPS أو localhost."
          );
        }

        // 1. Fast & Accurate Native BarcodeDetector path (Android Chrome / Edge / Samsung Internet)
        const NativeBarcodeDetector = (window as any).BarcodeDetector;
        if (NativeBarcodeDetector) {
          const videoConstraints: MediaTrackConstraints = selectedCameraId
            ? {
                deviceId: { exact: selectedCameraId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              };

          const stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });

          if (!isMounted) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }

          mediaStreamRef.current = stream;

          const videoEl = videoRef.current;
          if (videoEl) {
            videoEl.srcObject = stream;
            await videoEl.play().catch(() => {});
          }

          const track = stream.getVideoTracks()[0];
          if (track) {
            try {
              await track.applyConstraints({
                advanced: [{ focusMode: "continuous" } as any],
              });
            } catch {}
            try {
              const caps = track.getCapabilities?.() as any;
              if (caps && caps.torch) {
                setHasTorchCapability(true);
              }
            } catch {}
          }

          let detector: any;
          try {
            const desiredFormats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"];
            const supported = typeof NativeBarcodeDetector.getSupportedFormats === "function"
              ? await NativeBarcodeDetector.getSupportedFormats()
              : desiredFormats;
            const validFormats = desiredFormats.filter((f) => supported.includes(f));
            detector = validFormats.length > 0
              ? new NativeBarcodeDetector({ formats: validFormats })
              : new NativeBarcodeDetector();
          } catch {
            detector = new NativeBarcodeDetector();
          }

          setIsInitializing(false);

          // Populate camera list silently for Switch Camera button
          try {
            const allDevices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = allDevices.filter((d) => d.kind === "videoinput");
            if (isMounted && videoDevices.length > 0) {
              setCameras(videoDevices.map((d) => ({ id: d.deviceId, label: d.label || "كاميرا" })));
            }
          } catch {}

          let isDetecting = false;
          detectInterval = setInterval(async () => {
            if (!isMounted || isDetecting || !videoRef.current || videoRef.current.readyState < 2) {
              return;
            }
            isDetecting = true;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                handleDecodedTextRef.current(barcodes[0].rawValue, {
                  format: barcodes[0].format,
                });
              }
            } catch {}
            isDetecting = false;
          }, 120);

          return;
        }

        // 2. Fallback path (iOS Safari / Desktop Firefox) via html5-qrcode without restrictive qrbox cropping
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
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
          verbose: false,
        });

        html5QrCodeRef.current = qrCodeInstance;

        const config: any = {
          fps: 15,
          videoConstraints: selectedCameraId
            ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        };

        const onDecode = (decodedText: string, decodedResult: any) => {
          handleDecodedTextRef.current(decodedText, decodedResult);
        };

        await qrCodeInstance.start(
          selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: "environment" },
          config,
          onDecode,
          () => {}
        );

        if (!isMounted) {
          try {
            if (qrCodeInstance.isScanning) await qrCodeInstance.stop();
            qrCodeInstance.clear();
          } catch {}
          return;
        }

        setIsInitializing(false);

        try {
          const devices = await Html5Qrcode.getCameras();
          if (isMounted && devices && devices.length > 0) {
            setCameras(devices.map((d) => ({ id: d.id, label: d.label || "كاميرا" })));
          }
        } catch {}

        try {
          const capabilities = qrCodeInstance.getRunningTrackCapabilities();
          if (capabilities && (capabilities as any).torch) {
            setHasTorchCapability(true);
          }
        } catch {}
      } catch (err: any) {
        if (!isMounted) return;
        stopNativeStream();
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
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopNativeStream();
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
          
          {/* Native Video Stream (used when BarcodeDetector is available) */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* HTML5 QR Fallback Container */}
          <div
            id={scannerContainerId}
            className="relative w-full h-full min-h-[300px] empty:hidden [&>video]:w-full [&>video]:h-full [&>video]:object-cover"
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
