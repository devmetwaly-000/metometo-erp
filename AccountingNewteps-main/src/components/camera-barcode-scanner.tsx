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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<any>(null);
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

  // Crisp retail scanner beep via Web Audio API
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
    } catch {}
  }, [isSoundEnabled]);

  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch {}
  }, []);

  const handleDecodedResult = useCallback(
    (decodedText: string, formatId?: number) => {
      if (!decodedText) return;
      const cleanCode = decodedText.trim();
      const now = Date.now();

      // Validate GS1 check digit for 8/12/13-digit numeric barcodes (EAN-8=6, EAN-13=7, UPC-A=14 in ZXing)
      if (
        (formatId === 7 || (cleanCode.length === 13 && /^\d{13}$/.test(cleanCode))) &&
        !isValidGs1CheckDigit(cleanCode)
      ) {
        return;
      }
      if ((formatId === 6 || formatId === 14) && !isValidGs1CheckDigit(cleanCode)) {
        return;
      }

      // Debounce duplicate scans within 1.5s
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
      onScan(cleanCode);

      if (!isContinuous) {
        onOpenChange(false);
      }
    },
    [isContinuous, onScan, onOpenChange, playBeep, triggerHaptic]
  );

  const handleDecodedResultRef = useRef(handleDecodedResult);
  handleDecodedResultRef.current = handleDecodedResult;

  const toggleTorch = async () => {
    const newTorchState = !isTorchOn;
    try {
      if (controlsRef.current?.switchTorch) {
        await controlsRef.current.switchTorch(newTorchState);
        setIsTorchOn(newTorchState);
        return;
      }
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ torch: newTorchState } as any],
        });
        setIsTorchOn(newTorchState);
      }
    } catch {
      setHasTorchCapability(false);
    }
  };

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

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

    const stopCurrentControls = () => {
      if (controlsRef.current) {
        try {
          controlsRef.current.stop();
        } catch {}
        controlsRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        videoRef.current.srcObject = null;
      }
    };

    const startZxingScanner = async () => {
      try {
        stopCurrentControls();

        if (
          typeof navigator === "undefined" ||
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getUserMedia
        ) {
          throw new Error(
            "المتصفح يمنع تشغيل الكاميرا على اتصال غير آمن (HTTP). يرجى فتح النظام عبر HTTPS أو localhost."
          );
        }

        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);

        if (!isMounted || !videoRef.current) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const codeReader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 100,
          delayBetweenScanSuccess: 500,
        });

        const constraints: MediaStreamConstraints = {
          audio: false,
          video: selectedCameraId
            ? {
                deviceId: { exact: selectedCameraId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }
            : {
                facingMode: { ideal: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
        };

        const controls = await codeReader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result) => {
            if (!isMounted || !result) return;
            handleDecodedResultRef.current(
              result.getText(),
              result.getBarcodeFormat()
            );
          }
        );

        if (!isMounted) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setIsInitializing(false);

        // Apply continuous autofocus & detect torch capability
        try {
          const stream = videoRef.current?.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks?.()[0];
          if (track) {
            try {
              await track.applyConstraints({
                advanced: [{ focusMode: "continuous" } as any],
              });
            } catch {}
            const caps = track.getCapabilities?.() as any;
            if (caps && caps.torch) {
              setHasTorchCapability(true);
            }
          }
        } catch {}

        // Populate camera list for Switch Camera button
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          if (isMounted && devices.length > 0) {
            setCameras(
              devices.map((d) => ({
                id: d.deviceId,
                label: d.label || "كاميرا",
              }))
            );
          }
        } catch {}
      } catch (err: any) {
        if (!isMounted) return;
        stopCurrentControls();
        setIsInitializing(false);
        const msg = String(err?.message || err || "");
        if (
          msg.includes("Permission") ||
          msg.includes("denied") ||
          msg.includes("NotAllowedError")
        ) {
          setErrorMessage(
            "تم رفض إذن استخدام الكاميرا من المتصفح. يرجى السماح بالوصول للكاميرا من إعدادات المتصفح."
          );
        } else {
          setErrorMessage(`تعذر تشغيل الكاميرا: ${msg}`);
        }
      }
    };

    const timer = setTimeout(() => {
      startZxingScanner();
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      stopCurrentControls();
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
        <div className="relative flex-1 min-h-[320px] sm:min-h-[380px] bg-black flex items-center justify-center overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full min-h-[320px] object-cover"
          />

          {/* Scanner Overlay HUD */}
          {!isInitializing && !errorMessage && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              <div className="relative w-full max-w-[280px] h-[170px] border-2 border-primary/70 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-center justify-center">
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-bounce shadow-[0_0_8px_#ef4444]" />
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-primary rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-primary rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-primary rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-primary rounded-br-lg" />
                <div className="text-center text-[11px] font-medium text-white/80 bg-black/40 px-2.5 py-1 rounded-full backdrop-blur-sm">
                  ضع الباركود هنا
                </div>
              </div>

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

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => setIsSoundEnabled(!isSoundEnabled)}
              title={isSoundEnabled ? "كتم الصوت" : "تفعيل الصوت"}
            >
              {isSoundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>

          {recentScansCount > 0 && (
            <div className="absolute top-3 left-3 z-10">
              <Badge variant="secondary" className="bg-black/60 text-white border-0 backdrop-blur-md">
                <Scan className="h-3 w-3 ml-1 text-emerald-400" />
                {recentScansCount} مسح
              </Badge>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <DialogFooter className="p-3 bg-muted/40 border-t flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="continuous-scan-mode"
              checked={isContinuous}
              onCheckedChange={setIsContinuous}
            />
            <Label htmlFor="continuous-scan-mode" className="text-xs font-medium cursor-pointer">
              مسح مستمر للأصناف
            </Label>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
