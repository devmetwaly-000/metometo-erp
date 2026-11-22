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
  ImagePlus,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Focus,
} from "lucide-react";

export interface ScannedCartPreviewItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  total: number;
  barcode?: string;
}

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (barcode: string) => void;
  title?: string;
  defaultContinuous?: boolean;
  scannedItems?: ScannedCartPreviewItem[];
  totalAmount?: number;
  onUpdateQty?: (id: string, newQty: number) => void;
}

export default function CameraBarcodeScanner({
  isOpen,
  onOpenChange,
  onScan,
  title = "مسح الباركود بكاميرا الموبايل",
  defaultContinuous = true,
  scannedItems,
  totalAmount,
  onUpdateQty,
}: CameraBarcodeScannerProps) {
  const [isInitializing, setIsInitializing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>("");
  const [cameraFeedbackMsg, setCameraFeedbackMsg] = useState<string | null>(null);
  const [isContinuous, setIsContinuous] = useState(defaultContinuous);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorchCapability, setHasTorchCapability] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [recentScansCount, setRecentScansCount] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomValue, setZoomValue] = useState<number>(1);
  const [tapFocusCoord, setTapFocusCoord] = useState<{ x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const activeCameraIdRef = useRef<string | null>(null);
  const lastScanTimestampRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>("");

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
    (decodedText: string, formatName?: string) => {
      if (!decodedText) return;
      const cleanCode = decodedText.trim();
      if (!cleanCode) return;

      const now = Date.now();

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
      const track = streamRef.current?.getVideoTracks?.()[0];
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

  const applyZoom = async (newZoom: number) => {
    setZoomValue(newZoom);
    try {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ zoom: newZoom } as any],
        });
      }
    } catch {}
  };

  // Switch between available cameras
  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentId = selectedCameraId || activeCameraIdRef.current;
    const currentIndex = cameras.findIndex((c) => c.id === currentId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cameras.length : 0;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    setActiveCameraLabel(nextCamera.label);
    setCameraFeedbackMsg(`تم التبديل إلى: ${nextCamera.label}`);
    setTimeout(() => setCameraFeedbackMsg(null), 2500);
  };

  // Helper: Identify the primary 1x rear camera
  // CRITICAL: Modern smartphones label the main rear camera "Wide" or "Main". We must NEVER exclude "wide"!
  // Only exclude ultra-wide (0.5x), macro (fixed close-up), telephoto (zoom), and depth/tof sensors.
  const pickPrimaryBackCamera = (videoDevices: MediaDeviceInfo[]): MediaDeviceInfo | undefined => {
    if (!videoDevices.length) return undefined;

    const backCameras = videoDevices.filter((d) => {
      const l = (d.label || "").toLowerCase();
      const isFront = l.includes("front") || l.includes("user") || l.includes("أمام") || l.includes("selfie");
      if (isFront) return false;
      return l.includes("back") || l.includes("rear") || l.includes("environment") || l.includes("خلف") || !isFront;
    });

    const pool = backCameras.length > 0 ? backCameras : videoDevices;

    // Filter out auxiliary lenses that shouldn't be default:
    // ultra-wide, macro, telephoto, depth/tof
    const nonAuxiliaryBack = pool.filter((d) => {
      const l = (d.label || "").toLowerCase();
      const isUltraWide = l.includes("ultra") || l.includes("0.5") || l.includes("0.6");
      const isMacro = l.includes("macro") || l.includes("micro");
      const isTele = l.includes("tele") || l.includes("periscope") || l.includes("zoom");
      const isDepth = l.includes("depth") || l.includes("tof") || l.includes("ir");
      return !isUltraWide && !isMacro && !isTele && !isDepth;
    });

    const candidates = nonAuxiliaryBack.length > 0 ? nonAuxiliaryBack : pool;

    // Primary candidates: labeled "0", "main", "primary", or "wide" (without ultra)
    const mainCam = candidates.find((d) => {
      const l = (d.label || "").toLowerCase();
      return (
        l.includes("main") ||
        l.includes("primary") ||
        /\b0\b/.test(l) ||
        l.includes("camera 0") ||
        l.includes("camera2 0") ||
        l.includes("back 0") ||
        (l.includes("wide") && !l.includes("ultra"))
      );
    });

    return mainCam || candidates[0];
  };

  // Tap-to-focus on viewfinder
  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTapFocusCoord({ x, y });
    setTimeout(() => setTapFocusCoord(null), 1200);

    const track = streamRef.current?.getVideoTracks?.()[0];
    if (track) {
      try {
        const caps = track.getCapabilities?.() as any;
        if (caps && caps.focusMode && Array.isArray(caps.focusMode)) {
          if (caps.focusMode.includes("continuous")) {
            await track.applyConstraints({
              advanced: [{ focusMode: "continuous" } as any],
            });
          }
        }
      } catch {}
    }
  };

  // Native camera photo capture fallback
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // 1. Try Native BarcodeDetector if available
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const detector = new (window as any).BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
          });
          const bitmap = await createImageBitmap(file);
          const results = await detector.detect(bitmap);
          if (results && results.length > 0 && results[0].rawValue) {
            handleDecodedResultRef.current(results[0].rawValue, results[0].format);
            return;
          }
        } catch {}
      }

      // 2. ZXing-WASM Fallback
      const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
      await prepareZXingModule({
        overrides: {
          locateFile: (path: string, prefix: string) =>
            path.endsWith(".wasm") ? "/wasm/zxing_reader.wasm" : prefix + path,
        },
      });
      const results = await readBarcodes(file, {
        formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "QRCode"],
        tryRotate: true,
        tryHarder: true,
        tryInvert: true,
        maxNumberOfSymbols: 1,
      });
      if (results && results.length > 0 && results[0].isValid && results[0].text) {
        handleDecodedResultRef.current(results[0].text, results[0].format);
      } else {
        setErrorMessage("لم يتم العثور على باركود واضح في الصورة. يرجى التقريب والمحاولة مرة أخرى.");
      }
    } catch {
      setErrorMessage("تعذر قراءة الباركود من الصورة.");
    } finally {
      e.target.value = "";
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setLastScannedCode(null);
      setErrorMessage(null);
      return;
    }

    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let rafActive = false;

    setIsInitializing(true);
    setErrorMessage(null);
    setHasTorchCapability(false);
    setIsTorchOn(false);

    const stopStream = () => {
      rafActive = false;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const startScanner = async () => {
      try {
        stopStream();

        if (
          typeof navigator === "undefined" ||
          !navigator.mediaDevices ||
          !navigator.mediaDevices.getUserMedia
        ) {
          throw new Error(
            "المتصفح يمنع تشغيل البث المباشر على اتصال HTTP غير آمن. يمكنك استخدام زر (تصوير) بالأسفل أو فتح الرابط عبر HTTPS."
          );
        }

        // Initialize Native BarcodeDetector (Chrome on Android / Edge)
        let nativeDetector: any = null;
        if (typeof window !== "undefined" && "BarcodeDetector" in window) {
          try {
            const supportedFormats: string[] =
              (await (window as any).BarcodeDetector.getSupportedFormats?.().catch(() => [])) || [];
            const desiredFormats = [
              "ean_13",
              "ean_8",
              "upc_a",
              "upc_e",
              "code_128",
              "code_39",
              "code_93",
              "codabar",
              "itf",
              "qr_code",
              "data_matrix",
            ];
            const activeFormats = supportedFormats.length > 0
              ? desiredFormats.filter((f) => supportedFormats.includes(f))
              : desiredFormats;

            nativeDetector = new (window as any).BarcodeDetector({
              formats: activeFormats.length > 0 ? activeFormats : undefined,
            });
          } catch {
            nativeDetector = null;
          }
        }

        // Also prepare ZXing-WASM as robust fallback (e.g. iOS Safari)
        let zxingReadBarcodes: any = null;
        try {
          const { prepareZXingModule, readBarcodes } = await import("zxing-wasm/reader");
          await prepareZXingModule({
            overrides: {
              locateFile: (path: string, prefix: string) =>
                path.endsWith(".wasm") ? "/wasm/zxing_reader.wasm" : prefix + path,
            },
            fireImmediately: true,
          });
          zxingReadBarcodes = readBarcodes;
        } catch {}

        if (!isMounted) return;

        // Camera stream request
        const videoConstraints: MediaTrackConstraints = selectedCameraId
          ? {
              deviceId: { exact: selectedCameraId },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920, min: 1280 },
              height: { ideal: 1080, min: 720 },
            };

        let stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Enumerate devices to list cameras and ensure primary 1x back camera is selected
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === "videoinput");
          if (isMounted && videoDevices.length > 0) {
            setCameras(
              videoDevices.map((d, idx) => ({
                id: d.deviceId,
                label: d.label || `كاميرا ${idx + 1}`,
              }))
            );

            const currentTrack = stream.getVideoTracks()[0];
            const currentTrackDeviceId = currentTrack?.getSettings?.()?.deviceId;
            const currentTrackLabel = currentTrack?.label || "";
            setActiveCameraLabel(currentTrackLabel || "الكاميرا الأساسية");

            // Only switch automatically if user hasn't selected a camera AND current stream is front-facing or aux macro/ultra
            if (!selectedCameraId) {
              const curLabelLower = currentTrackLabel.toLowerCase();
              const isFrontOrAux =
                curLabelLower.includes("front") ||
                curLabelLower.includes("user") ||
                curLabelLower.includes("ultra") ||
                curLabelLower.includes("macro") ||
                curLabelLower.includes("0.5") ||
                curLabelLower.includes("0.6");

              if (isFrontOrAux) {
                const primaryCam = pickPrimaryBackCamera(videoDevices);
                if (primaryCam && primaryCam.deviceId && primaryCam.deviceId !== currentTrackDeviceId) {
                  stream.getTracks().forEach((t) => t.stop());
                  stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                      deviceId: { exact: primaryCam.deviceId },
                      width: { ideal: 1920, min: 1280 },
                      height: { ideal: 1080, min: 720 },
                    },
                    audio: false,
                  });
                  if (!isMounted) {
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                  }
                  setActiveCameraLabel(primaryCam.label || "الكاميرا الأساسية 1x");
                }
              }
            }
          }
        } catch {}

        streamRef.current = stream;
        activeCameraIdRef.current = stream.getVideoTracks()[0]?.getSettings?.()?.deviceId || selectedCameraId;

        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          await videoEl.play().catch(() => {});
        }

        // Apply autofocus & check capabilities (torch, zoom)
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
            if (
              caps &&
              caps.zoom &&
              typeof caps.zoom.min === "number" &&
              typeof caps.zoom.max === "number" &&
              caps.zoom.max > caps.zoom.min
            ) {
              const minZ = caps.zoom.min;
              const maxZ = Math.min(caps.zoom.max, 5);
              const stepZ = caps.zoom.step || 0.1;
              setZoomRange({ min: minZ, max: maxZ, step: stepZ });
              setZoomValue(minZ); // Default to 1x native optical sensor
            } else {
              setZoomRange(null);
            }
          } catch {}
        }

        setIsInitializing(false);
        rafActive = true;

        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }
        if (!cropCanvasRef.current) {
          cropCanvasRef.current = document.createElement("canvas");
        }
        const fullCanvas = canvasRef.current;
        const fullCtx = fullCanvas.getContext("2d", { willReadFrequently: true });
        const cropCanvas = cropCanvasRef.current;
        const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });

        let frameCounter = 0;

        const scanLoop = async () => {
          if (!isMounted || !rafActive) return;

          try {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
              let detected = false;

              // 1. ENGINE 1: Native Hardware BarcodeDetector (Android Chrome ML Kit / GPU)
              if (nativeDetector) {
                try {
                  const barcodes = await nativeDetector.detect(video);
                  if (barcodes && barcodes.length > 0) {
                    for (const bc of barcodes) {
                      if (bc.rawValue) {
                        handleDecodedResultRef.current(bc.rawValue, bc.format);
                        detected = true;
                        break;
                      }
                    }
                  }
                } catch {}
              }

              // 2. ENGINE 2: ZXing-WASM (Ultra-fast center crop & full-frame fallback)
              if (!detected && zxingReadBarcodes) {
                const vw = video.videoWidth;
                const vh = video.videoHeight;
                frameCounter++;

                // A) Center-crop at 1:1 sensor resolution (sharp unscaled barcode stripes)
                const cropW = Math.round(vw * 0.65);
                const cropH = Math.round(vh * 0.45);
                const cropX = Math.round((vw - cropW) / 2);
                const cropY = Math.round((vh - cropH) / 2);

                if (cropCtx) {
                  if (cropCanvas.width !== cropW || cropCanvas.height !== cropH) {
                    cropCanvas.width = cropW;
                    cropCanvas.height = cropH;
                  }
                  cropCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
                  const cropData = cropCtx.getImageData(0, 0, cropW, cropH);

                  const cropResults = await zxingReadBarcodes(cropData, {
                    formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "QRCode"],
                    tryRotate: true,
                    tryHarder: false,
                    maxNumberOfSymbols: 1,
                  });

                  if (isMounted && cropResults && cropResults.length > 0 && cropResults[0].isValid && cropResults[0].text) {
                    handleDecodedResultRef.current(cropResults[0].text, cropResults[0].format);
                    detected = true;
                  }
                }

                // B) If still not detected, scan full frame every 3rd cycle
                if (!detected && frameCounter % 3 === 0 && fullCtx) {
                  const targetW = Math.min(vw, 1280);
                  const scale = targetW / vw;
                  const targetH = Math.round(vh * scale);

                  if (fullCanvas.width !== targetW || fullCanvas.height !== targetH) {
                    fullCanvas.width = targetW;
                    fullCanvas.height = targetH;
                  }

                  fullCtx.drawImage(video, 0, 0, targetW, targetH);
                  const fullData = fullCtx.getImageData(0, 0, targetW, targetH);

                  const fullResults = await zxingReadBarcodes(fullData, {
                    formats: ["EAN13", "EAN8", "UPCA", "UPCE", "Code128", "Code39", "QRCode"],
                    tryRotate: true,
                    tryHarder: true,
                    tryInvert: true,
                    maxNumberOfSymbols: 1,
                  });

                  if (isMounted && fullResults && fullResults.length > 0 && fullResults[0].isValid && fullResults[0].text) {
                    handleDecodedResultRef.current(fullResults[0].text, fullResults[0].format);
                  }
                }
              }
            }
          } catch {}

          if (isMounted && rafActive) {
            timerId = setTimeout(scanLoop, 90);
          }
        };

        timerId = setTimeout(scanLoop, 100);
      } catch (err: any) {
        if (!isMounted) return;
        stopStream();
        setIsInitializing(false);
        const msg = String(err?.message || err || "");
        if (
          msg.includes("Permission") ||
          msg.includes("denied") ||
          msg.includes("NotAllowedError")
        ) {
          setErrorMessage(
            "تم رفض إذن استخدام الكاميرا من المتصفح. يرجى السماح بالوصول للكاميرا من إعدادات المتصفح أو استخدام زر تصوير بالأسفل."
          );
        } else {
          setErrorMessage(`تعذر تشغيل الكاميرا: ${msg}`);
        }
      }
    };

    const bootTimer = setTimeout(startScanner, 100);

    return () => {
      isMounted = false;
      clearTimeout(bootTimer);
      stopStream();
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
                {activeCameraLabel ? `وجّه الكاميرا نحو الباركود (${activeCameraLabel.slice(0, 25)})` : "وجّه كاميرا الموبايل نحو باركود الصنف"}
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
        <div
          className="relative min-h-[260px] sm:min-h-[320px] max-h-[45vh] bg-black flex items-center justify-center overflow-hidden cursor-crosshair select-none"
          onClick={handleTapToFocus}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full min-h-[260px] object-cover"
          />

          {/* Tap-to-focus animation ring */}
          {tapFocusCoord && (
            <div
              className="absolute pointer-events-none w-12 h-12 border-2 border-amber-400 rounded-full animate-ping z-30"
              style={{
                left: tapFocusCoord.x - 24,
                top: tapFocusCoord.y - 24,
              }}
            />
          )}

          {/* Scanner Overlay HUD */}
          {!isInitializing && !errorMessage && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              <div className="mb-3 text-center text-[11px] font-medium text-white/95 bg-black/65 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-1.5 shadow-md">
                <Focus className="h-3 w-3 text-emerald-400" />
                <span>ضع الباركود داخل الإطار (انقر للشاشة للتركيز الفوري)</span>
              </div>

              {/* Viewfinder Bounding Box */}
              <div className="relative w-full max-w-[290px] h-[175px] border-2 border-primary/90 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-center justify-center">
                {/* Red Laser Scanning Beam */}
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-bounce shadow-[0_0_10px_#ef4444]" />

                {/* Corner Accents */}
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-primary rounded-br-xl" />

                <div className="text-[10px] text-white/80 bg-black/60 px-2 py-0.5 rounded-full pointer-events-none">
                  ضع الباركود هنا
                </div>
              </div>

              {/* Zoom Controls */}
              {zoomRange && (
                <div className="mt-3 pointer-events-auto flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                  <button
                    type="button"
                    onClick={() => applyZoom(1)}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
                      zoomValue <= 1.1 ? "bg-primary text-primary-foreground font-bold" : "text-white/80 hover:bg-white/20"
                    }`}
                  >
                    1x
                  </button>
                  <button
                    type="button"
                    onClick={() => applyZoom(Math.min(zoomRange.max, 1.5))}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
                      zoomValue > 1.1 && zoomValue <= 1.7 ? "bg-primary text-primary-foreground font-bold" : "text-white/80 hover:bg-white/20"
                    }`}
                  >
                    1.5x
                  </button>
                  <button
                    type="button"
                    onClick={() => applyZoom(Math.min(zoomRange.max, 2.0))}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${
                      zoomValue > 1.7 ? "bg-primary text-primary-foreground font-bold" : "text-white/80 hover:bg-white/20"
                    }`}
                  >
                    2x
                  </button>
                  <input
                    type="range"
                    min={zoomRange.min}
                    max={zoomRange.max}
                    step={zoomRange.step}
                    value={zoomValue}
                    onChange={(e) => applyZoom(Number(e.target.value))}
                    className="w-24 accent-primary cursor-pointer"
                  />
                  <span className="text-[11px] text-white/90 font-mono min-w-[28px]">{zoomValue.toFixed(1)}x</span>
                </div>
              )}

              {/* Scanned Feedback Toast */}
              {lastScannedCode && (
                <div className="mt-3 pointer-events-auto bg-emerald-600 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>تم المسح بنجاح: {lastScannedCode}</span>
                </div>
              )}
            </div>
          )}

          {/* Camera switched feedback message */}
          {cameraFeedbackMsg && (
            <div className="absolute top-14 inset-x-4 z-20 pointer-events-none flex justify-center">
              <span className="bg-black/80 text-white text-xs px-3 py-1 rounded-full backdrop-blur-md border border-white/20 animate-in fade-in">
                {cameraFeedbackMsg}
              </span>
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
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10">
            {cameras.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={switchCamera}
                title="تبديل الكاميرا (الأساسية / أخرى)"
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

        {/* Scanned Items List inside Camera Modal */}
        {scannedItems !== undefined && (
          <div className="border-t bg-card flex flex-col max-h-[200px] shrink-0" dir="rtl">
            <div className="px-3 py-2 bg-muted/40 border-b flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-bold text-foreground">
                <ShoppingCart className="h-3.5 w-3.5 text-primary" />
                <span>الأصناف الممسوحة ({scannedItems.length})</span>
              </div>
              {typeof totalAmount === "number" && (
                <span className="font-mono font-bold text-primary">
                  الإجمالي: {totalAmount.toFixed(2)} ج.م
                </span>
              )}
            </div>
            <div className="overflow-y-auto divide-y divide-border/50 px-2 py-1">
              {scannedItems.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-4">
                  لم يتم مسح أي صنف بعد — وجّه الكاميرا نحو الباركود للإضافة
                </p>
              ) : (
                scannedItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 py-1.5 px-1 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {item.price.toFixed(2)} ج.م {item.barcode ? `• ${item.barcode}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onUpdateQty ? (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 rounded-md"
                            onClick={() => onUpdateQty(item.id, item.qty - 1)}
                          >
                            {item.qty <= 1 ? (
                              <Trash2 className="h-3 w-3 text-destructive" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                          </Button>
                          <span className="w-6 text-center font-mono font-bold text-xs">
                            {item.qty}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 rounded-md"
                            onClick={() => onUpdateQty(item.id, item.qty + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <Badge variant="secondary" className="font-mono text-[11px]">
                          ×{item.qty}
                        </Badge>
                      )}
                      <span className="w-16 text-left font-mono font-bold text-primary">
                        {item.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Hidden Native Camera Photo Input */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoCapture}
        />

        {/* Footer Controls */}
        <DialogFooter className="p-3 bg-muted/40 border-t flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="continuous-scan-mode"
              checked={isContinuous}
              onCheckedChange={setIsContinuous}
            />
            <Label htmlFor="continuous-scan-mode" className="text-xs font-medium cursor-pointer">
              مسح مستمر
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => photoInputRef.current?.click()}
              title="التقاط صورة بكاميرا الموبايل الأصلية"
            >
              <ImagePlus className="h-4 w-4 ml-1.5" />
              تصوير
            </Button>
            <Button
              variant="outline"
              size="sm"
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
