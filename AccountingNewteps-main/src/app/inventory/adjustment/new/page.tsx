"use client";

import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter as CardFooterUI } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  PlusCircle,
  Trash2,
  Loader2,
  Download,
  Upload,
  Camera,
  Save,
  Boxes,
  AlertCircle,
  SwitchCamera,
  Flashlight,
  Volume2,
  VolumeX,
  Plus,
  Minus,
  Layers,
  Warehouse as WarehouseIcon,
  FolderTree,
  Search,
  CheckCircle2,
  ImagePlus,
  Sparkles,
  RotateCcw,
  RefreshCw,
  Users,
  Lock,
  FileCheck2
} from "lucide-react";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/contexts/auth-context";
import { useData } from "@/contexts/data-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateStockForItemInWarehouse } from "@/lib/inventory-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

interface AdjustmentItem {
  itemId: string;
  itemName: string;
  itemCode?: string;
  sectionName?: string;
  subGroupName?: string;
  systemQty: number;
  actualQty: number;
  difference: number;
  uniqueId: string;
}

interface InventoryCountSheet {
  id: string;
  sessionId: string;
  deviceName: string;
  submittedById?: string;
  submittedByName?: string;
  items: { itemId: string; itemName: string; itemCode?: string; actualQty: number }[];
  notes?: string;
  createdAt?: string;
}

interface InventoryCountSession {
  id: string;
  sessionCode: string;
  warehouseId: string;
  warehouseSectionId?: string;
  adjustmentType: "periodic_count" | "opening_balance";
  snapshotDate: string;
  snapshotDateStr: string;
  catalogScope?: string;
  scopeLabel?: string;
  frozenBalances: Record<string, number>;
  status: "open" | "consolidated" | "cancelled";
  createdById?: string;
  createdByName?: string;
  createdAt?: string;
  notes?: string;
  sheets: InventoryCountSheet[];
}

interface SecondaryUnit {
  name: string;
  conversionFactor: number;
  price?: number;
  barcode?: string;
}

interface Item {
  id: string;
  name: string;
  code?: string;
  unit?: string;
  baseUnit?: string;
  cost?: number;
  sectionId?: string;
  categoryId?: string;
  itemGroupId?: string;
  subCategoryId1?: string;
  subCategoryId2?: string;
  itemType?: "standard" | "raw_material" | "manufactured";
  secondaryUnits?: SecondaryUnit[];
}

// Helper to play a crisp scanner beep using Web Audio API (no external audio file needed)
const playScanBeep = (success = true) => {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = success ? "sine" : "sawtooth";
    osc.frequency.setValueAtTime(success ? 1046.5 : 240, ctx.currentTime);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (success ? 0.12 : 0.25));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
  } catch {}
};

export default function NewStockAdjustmentPage() {
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();
  const allDataContext = useData();
  const {
    items: allItems,
    warehouses,
    inventoryZones,
    inventorySections,
    inventory,
    itemSections,
    itemCategories,
    itemGroups,
    itemSubCategories1,
    itemSubCategories2,
    dbAction,
    getNextId,
    loading
  } = allDataContext;

  const { user } = useAuth();

  // 1. نوع التسوية (جرد دوري / جرد افتتاحي)
  const [adjustmentType, setAdjustmentType] = useState<"periodic_count" | "opening_balance">("periodic_count");
  const [adjustmentDate, setAdjustmentDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  // 2. نطاق المكان المخزني (مخزن فرعي / مخزن رئيسي لوجيستي / حاوية داخل مخزن رئيسي)
  const [locationType, setLocationType] = useState<"all_warehouses" | "branch_warehouse" | "main_warehouse">("all_warehouses");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>("");
  const [selectedWarehouseSection, setSelectedWarehouseSection] = useState<string>("all"); // حاوية داخل المخزن الرئيسي

  // 3. نطاق الجرد التصنيفي (كل الأصناف / على مستوى القسم / الفئة / المجموعة الفرعية)
  const [catalogScope, setCatalogScope] = useState<"all" | "section" | "category" | "sub_group">("all");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedSubGroupId, setSelectedSubGroupId] = useState<string>("all");

  // 4. قائمة الأصناف المجرودة والبحث داخلها
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [tableSearch, setTableSearch] = useState<string>("");
  const [newItem, setNewItem] = useState({ itemId: "", actualQty: 0 });
  const [notes, setNotes] = useState<string>("");

  const [isSaving, setIsSaving] = useState(false);
  const [duplicateItemInfo, setDuplicateItemInfo] = useState<{ item: AdjustmentItem; newQty: number } | null>(null);

  // جلسات الجرد المتعدد وتجنيب الأرصدة الدفترية
  const [countSessions, setCountSessions] = useState<InventoryCountSession[]>([]);
  const [isIndexedDbMode, setIsIndexedDbMode] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string>("direct");
  const [deviceName, setDeviceName] = useState<string>("");
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isSessionActionLoading, setIsSessionActionLoading] = useState(false);
  const [isConsolidatedPreview, setIsConsolidatedPreview] = useState(false);

  const LOCAL_SESSIONS_KEY = "inventory_count_sessions_v1";

  const activeSession = useMemo(
    () => countSessions.find((s) => s.id === activeSessionId) || null,
    [countSessions, activeSessionId]
  );

  useEffect(() => {
    if (!deviceName && user?.name) {
      setDeviceName(`${user.name} (${isMobile ? "موبايل" : "جهاز كمبيوتر"})`);
    }
  }, [user, isMobile, deviceName]);

  const loadCountSessions = useCallback(async () => {
    setIsSessionsLoading(true);
    try {
      const res = await fetch("/api/inventory/count-sessions?status=open", { cache: "no-store" });
      const json = await res.json();
      if (json.isIndexedDb) {
        setIsIndexedDbMode(true);
        try {
          const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
          const parsed: InventoryCountSession[] = raw ? JSON.parse(raw) : [];
          setCountSessions(parsed.filter((s) => s.status === "open"));
        } catch {
          setCountSessions([]);
        }
      } else if (json.success) {
        setIsIndexedDbMode(false);
        setCountSessions(json.sessions || []);
      }
    } catch {
      // ignore silent network error
    } finally {
      setIsSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCountSessions();
  }, [loadCountSessions]);

  // إعادة حساب الأرصدة الدفترية تلقائياً عند تغيير تاريخ الجرد في الوضع المباشر
  useEffect(() => {
    if (activeSession || isConsolidatedPreview || !selectedWarehouse || items.length === 0) return;
    setItems((prev) =>
      prev.map((row) => {
        const nextSys = calculateSystemStock(row.itemId, selectedWarehouse, adjustmentDate);
        return {
          ...row,
          systemQty: nextSys,
          difference: Number((row.actualQty - nextSys).toFixed(3))
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustmentDate]);

  // 5. إعدادات الكاميرا وماسح الباركود الذكي
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanMode, setScanMode] = useState<"instant_increment" | "select_and_type">("instant_increment");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [lastScannedItem, setLastScannedItem] = useState<{
    itemId: string;
    name: string;
    code: string;
    addedQty: number;
    totalActualQty: number;
    systemQty: number;
    unitLabel: string;
  } | null>(null);

  const newItemQtyInputRef = useRef<HTMLInputElement>(null);
  const zxingControlsRef = useRef<any>(null);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const cameraFileInputRef = useRef<HTMLInputElement>(null);

  // تحديد ما إذا كان المخزن المختار مخزناً رئيسياً (لوجيستياً)
  const isSelectedMainWarehouse = useMemo(() => {
    if (!selectedWarehouse) return false;
    const inZones = (inventoryZones || []).some((z: any) => z.id === selectedWarehouse);
    const inMainWh = (warehouses || []).some((w: any) => w.id === selectedWarehouse && w.isMain);
    return inZones || inMainWh;
  }, [selectedWarehouse, inventoryZones, warehouses]);

  // الأقسام/الحاويات الداخلية التابعة للمخزن الرئيسي المختار
  const warehouseInternalSections = useMemo(() => {
    if (!selectedWarehouse || !isSelectedMainWarehouse) return [];
    return (inventorySections || []).filter(
      (s: any) => (s.mainWarehouseId || s.MainWarehouseId) === selectedWarehouse
    );
  }, [selectedWarehouse, isSelectedMainWarehouse, inventorySections]);

  // الفروع المصرح بها
  const authorizedBranches = useMemo(() => {
    const b = (warehouses || []).filter((w: any) => !w.isMain && !w.isRepWarehouse && !w.repId);
    if (user?.warehouseIds?.includes("all")) return b;
    return b.filter((w: any) => user?.warehouseIds?.includes(w.id));
  }, [warehouses, user]);

  useEffect(() => {
    if (authorizedBranches.length === 1) {
      setBranchFilter(authorizedBranches[0].id);
    }
  }, [authorizedBranches]);

  // قائمة المخازن (مفلترة حسب نوع المخزن: الكل / مخزن فرعي / مخزن رئيسي)
  const warehouseOptions = useMemo(() => {
    const map = new Map<string, any>();
    [...(warehouses || []), ...(inventoryZones || [])].forEach((w: any) => {
      if (!w || w.isRepWarehouse || w.repId) return;
      map.set(w.id, {
        ...w,
        isMainWarehouse: Boolean(w.isMain || (inventoryZones || []).some((z: any) => z.id === w.id))
      });
    });

    let list = Array.from(map.values());

    if (!user?.warehouseIds?.includes("all")) {
      list = list.filter((w: any) => user?.warehouseIds?.includes(w.id));
    }

    if (locationType === "branch_warehouse") {
      list = list.filter((w: any) => !w.isMainWarehouse);
    } else if (locationType === "main_warehouse") {
      list = list.filter((w: any) => w.isMainWarehouse);
    }

    if (branchFilter !== "all") {
      list = list.filter((w: any) => w.id === branchFilter || w.branchId === branchFilter);
    }

    return list.map((w: any) => ({
      value: w.id,
      label: `${w.name} (${w.isMainWarehouse ? "مخزن رئيسي" : "مخزن فرعي"})`
    }));
  }, [warehouses, inventoryZones, user, locationType, branchFilter]);

  const branchOptions = useMemo(() => {
    return [
      { value: "all", label: "كل الفروع المصرح بها" },
      ...authorizedBranches.map((b: any) => ({ value: b.id, label: b.name }))
    ];
  }, [authorizedBranches]);

  // خيارات الأقسام السلعية
  const sectionOptions = useMemo(() => {
    return [
      { value: "all", label: "كل الأقسام السلعية" },
      ...(itemSections || []).map((s: any) => ({ value: s.id, label: s.name }))
    ];
  }, [itemSections]);

  // خيارات الفئات الرئيسية
  const categoryOptions = useMemo(() => {
    let cats = itemCategories || [];
    if (selectedSectionId !== "all") {
      cats = cats.filter((c: any) => !c.sectionId || c.sectionId === selectedSectionId);
    }
    return [
      { value: "all", label: "كل التصنيفات والفئات" },
      ...cats.map((c: any) => ({ value: c.id, label: c.name }))
    ];
  }, [itemCategories, selectedSectionId]);

  // خيارات المجموعات الفرعية (تدمج مجموعات الأصناف + المجموعات الفرعية 1 و 2)
  const subGroupOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [
      { value: "all", label: "كل المجموعات الفرعية" }
    ];
    (itemGroups || []).forEach((g: any) => {
      opts.push({ value: `group:${g.id}`, label: `مجموعة: ${g.name}` });
    });
    (itemSubCategories1 || []).forEach((sc1: any) => {
      opts.push({ value: `sub1:${sc1.id}`, label: `فرعي 1: ${sc1.name}` });
    });
    (itemSubCategories2 || []).forEach((sc2: any) => {
      opts.push({ value: `sub2:${sc2.id}`, label: `فرعي 2: ${sc2.name}` });
    });
    return opts;
  }, [itemGroups, itemSubCategories1, itemSubCategories2]);

  // دوال مساعدة لأسماء القسم والمجموعة الفرعية
  const getSectionName = useCallback(
    (sectionId?: string) => {
      if (!sectionId) return "-";
      return (itemSections || []).find((s: any) => s.id === sectionId)?.name || "-";
    },
    [itemSections]
  );

  const getSubGroupName = useCallback(
    (item: Item) => {
      if (item.itemGroupId) {
        const g = (itemGroups || []).find((x: any) => x.id === item.itemGroupId);
        if (g) return g.name;
      }
      if (item.subCategoryId1) {
        const s1 = (itemSubCategories1 || []).find((x: any) => x.id === item.subCategoryId1);
        if (s1) return s1.name;
      }
      if (item.subCategoryId2) {
        const s2 = (itemSubCategories2 || []).find((x: any) => x.id === item.subCategoryId2);
        if (s2) return s2.name;
      }
      if (item.categoryId) {
        const c = (itemCategories || []).find((x: any) => x.id === item.categoryId);
        if (c) return c.name;
      }
      return "-";
    },
    [itemGroups, itemSubCategories1, itemSubCategories2, itemCategories]
  );

  // الأصناف المتاحة بعد تطبيق فلتر القسم أو الفئة أو المجموعة الفرعية
  const availableItems = useMemo(() => {
    return (allItems || []).filter((item: Item) => {
      if (item.itemType === "manufactured") return false;

      if (catalogScope === "section" && selectedSectionId !== "all") {
        if (item.sectionId !== selectedSectionId) return false;
      }

      if (catalogScope === "category" && selectedCategoryId !== "all") {
        if (item.categoryId !== selectedCategoryId) return false;
      }

      if (catalogScope === "sub_group" && selectedSubGroupId !== "all") {
        const [prefix, targetId] = selectedSubGroupId.split(":");
        if (prefix === "group" && item.itemGroupId !== targetId) return false;
        if (prefix === "sub1" && item.subCategoryId1 !== targetId) return false;
        if (prefix === "sub2" && item.subCategoryId2 !== targetId) return false;
      }

      return true;
    });
  }, [allItems, catalogScope, selectedSectionId, selectedCategoryId, selectedSubGroupId]);

  // حساب الرصيد الدفتري للصنف (يدعم المخزن الفرعي، والمخزن الرئيسي بالكامل، أو حاوية محددة، مع احترام تاريخ التجنيب/الجرد)
  const calculateSystemStock = useCallback(
    (itemId: string, warehouseId: string, dateOverride?: string): number => {
      if (!itemId || !warehouseId || adjustmentType === "opening_balance") return 0;

      // إذا كانت هناك جلسة جرد مجنّبة نشطة، نعتمد الرصيد الدفتري المجنّب في تاريخ الجرد وليس الرصيد الحالي
      if (
        activeSession &&
        activeSession.warehouseId === warehouseId &&
        activeSession.frozenBalances &&
        Object.prototype.hasOwnProperty.call(activeSession.frozenBalances, itemId)
      ) {
        return Number(activeSession.frozenBalances[itemId]) || 0;
      }

      const effectiveDateStr = dateOverride || adjustmentDate;
      const asOfDateObj = effectiveDateStr ? new Date(`${effectiveDateStr}T23:59:59.999`) : null;
      const maxTime = asOfDateObj ? asOfDateObj.getTime() : Infinity;

      // إذا تم اختيار حاوية/قسم داخلي محدد داخل المخزن الرئيسي
      if (isSelectedMainWarehouse && selectedWarehouseSection !== "all") {
        // عند تحديد تاريخ سابق أو استخدام التخصيصات، نحسب حتى التاريخ المحدد
        let allocatedQty = 0;
        let hasAllocations = false;
        (allDataContext.stockInRecords || [])
          .filter((si: any) => {
            const wMatch = si.warehouseId === warehouseId || si.WarehouseId === warehouseId;
            if (!wMatch) return false;
            const txDate = si?.date || si?.Date;
            if (txDate && new Date(txDate).getTime() > maxTime) return false;
            return true;
          })
          .forEach((si: any) => {
            (si.allocations || []).forEach((alloc: any) => {
              if (alloc.sectionId === selectedWarehouseSection && alloc.itemId === itemId) {
                hasAllocations = true;
                allocatedQty += Number(alloc.quantity) || 0;
              }
            });
          });
        if (hasAllocations) return allocatedQty;

        const sectionInv = (inventory || []).find(
          (inv: any) => inv.id === `${warehouseId}-${selectedWarehouseSection}`
        );
        if (sectionInv && sectionInv.items && sectionInv.items[itemId]) {
          return Number(sectionInv.items[itemId].balance) || 0;
        }
        return 0;
      }

      return calculateStockForItemInWarehouse(itemId, warehouseId, allDataContext, asOfDateObj);
    },
    [allDataContext, adjustmentType, adjustmentDate, activeSession, isSelectedMainWarehouse, selectedWarehouseSection, inventory]
  );

  // تحميل كافة أصناف النطاق المحدد دفعة واحدة في جدول الجرد
  const handleLoadScopeItems = (fillWithSystemQty: boolean) => {
    if (!selectedWarehouse) {
      toast({
        variant: "destructive",
        title: "اختر المخزن أولاً",
        description: "يرجى اختيار المخزن أو المخزن الرئيسي قبل تحميل أصناف النطاق."
      });
      return;
    }

    if (availableItems.length === 0) {
      toast({
        variant: "destructive",
        title: "لا توجد أصناف مطابقة",
        description: "لا توجد أصناف مسجلة تحت هذا القسم أو المجموعة الفرعية."
      });
      return;
    }

    const loaded: AdjustmentItem[] = availableItems.map((item: Item) => {
      const sysQty = calculateSystemStock(item.id, selectedWarehouse);
      const actQty = fillWithSystemQty ? sysQty : 0;
      return {
        itemId: item.id,
        itemName: item.name,
        itemCode: item.code || "",
        sectionName: getSectionName(item.sectionId),
        subGroupName: getSubGroupName(item),
        systemQty: sysQty,
        actualQty: actQty,
        difference: actQty - sysQty,
        uniqueId: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      };
    });

    setItems(loaded);
    toast({
      title: "تم تحميل أصناف النطاق بنجاح",
      description: `تم إدراج ${loaded.length} صنف في قائمة الجرد (${
        fillWithSystemQty ? "بالرصيد الدفتري الحالي" : "بكمية صفرية للجرد الفعلي"
      }).`
    });
  };

  // البحث الذكي عن الصنف بالباركود (يدعم الكود الأساسي، باركود الوحدات الفرعية/الكرتونة، وباركود الميزان)
  const findItemByScannedBarcode = useCallback(
    (rawBarcode: string): { item: Item; factor: number; unitLabel: string } | null => {
      const code = rawBarcode.trim();
      if (!code) return null;

      // 1. مطابقة الكود الأساسي أو المعرف في النطاق المحدد أولاً ثم في كل الأصناف
      const pools = [availableItems, (allItems || []).filter((i: Item) => i.itemType !== "manufactured")];
      for (const pool of pools) {
        // مطابقة الكود الأساسي
        const direct = pool.find(
          (i: Item) =>
            (i.code && String(i.code).trim() === code) || String(i.id).trim() === code
        );
        if (direct) {
          return { item: direct, factor: 1, unitLabel: direct.unit || direct.baseUnit || "قطعة" };
        }

        // مطابقة باركود الوحدات الفرعية (مثل كرتونة / باكت)
        for (const it of pool) {
          if (Array.isArray(it.secondaryUnits)) {
            const matchedSec = it.secondaryUnits.find(
              (u) => u.barcode && String(u.barcode).trim() === code
            );
            if (matchedSec) {
              return {
                item: it,
                factor: Number(matchedSec.conversionFactor) || 1,
                unitLabel: matchedSec.name || "وحدة فرعية"
              };
            }
          }
        }

        // مطابقة باركود الميزان EAN-13 (يبدأ بـ 20-29 وطوله 13 رقماً)
        if (code.length === 13 && /^2[0-9]/.test(code)) {
          const itemPrefix = code.substring(2, 7);
          const weightVal = parseInt(code.substring(7, 12), 10) / 1000;
          const scaleItem = pool.find(
            (i: Item) => i.code && String(i.code).trim().padStart(5, "0") === itemPrefix
          );
          if (scaleItem) {
            return {
              item: scaleItem,
              factor: weightVal > 0 ? weightVal : 1,
              unitLabel: "كجم (ميزان)"
            };
          }
        }
      }

      return null;
    },
    [availableItems, allItems]
  );

  // معالجة الباركود الممسوح بالكاميرا
  const handleScanSuccess = useCallback(
    (scannedCode: string, bypassCooldown = false) => {
      const now = Date.now();
      if (
        !bypassCooldown &&
        lastScanRef.current.code === scannedCode &&
        now - lastScanRef.current.time < 1200
      ) {
        return;
      }
      lastScanRef.current = { code: scannedCode, time: now };

      const match = findItemByScannedBarcode(scannedCode);
      if (!match) {
        if (soundEnabled) playScanBeep(false);
        toast({
          variant: "destructive",
          title: "صنف غير معروف",
          description: `لم يتم العثور على صنف بالباركود: ${scannedCode}`
        });
        return;
      }

      if (soundEnabled) playScanBeep(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(75);
        } catch {}
      }

      const { item, factor, unitLabel } = match;
      const sysQty = calculateSystemStock(item.id, selectedWarehouse);

      if (scanMode === "instant_increment") {
        // إضافة أو زيادة الكمية تلقائياً دون إغلاق الكاميرا
        setItems((prev) => {
          const existingIdx = prev.findIndex((i) => i.itemId === item.id);
          if (existingIdx > -1) {
            const updated = [...prev];
            const current = updated[existingIdx];
            const nextActual = Number((current.actualQty + factor).toFixed(3));
            updated[existingIdx] = {
              ...current,
              actualQty: nextActual,
              difference: Number((nextActual - current.systemQty).toFixed(3))
            };
            setLastScannedItem({
              itemId: item.id,
              name: item.name,
              code: scannedCode,
              addedQty: factor,
              totalActualQty: nextActual,
              systemQty: current.systemQty,
              unitLabel
            });
            return updated;
          } else {
            const newRow: AdjustmentItem = {
              itemId: item.id,
              itemName: item.name,
              itemCode: item.code || scannedCode,
              sectionName: getSectionName(item.sectionId),
              subGroupName: getSubGroupName(item),
              systemQty: sysQty,
              actualQty: factor,
              difference: Number((factor - sysQty).toFixed(3)),
              uniqueId: `${item.id}-${Date.now()}`
            };
            setLastScannedItem({
              itemId: item.id,
              name: item.name,
              code: scannedCode,
              addedQty: factor,
              totalActualQty: factor,
              systemQty: sysQty,
              unitLabel
            });
            return [newRow, ...prev];
          }
        });
      } else {
        // وضع تحديد الصنف وإدخال الكمية يدوياً
        setNewItem({ itemId: item.id, actualQty: factor });
        toast({
          title: "تم التقاط الباركود",
          description: `${item.name} (${unitLabel})`
        });
        setIsScannerOpen(false);
        setTimeout(() => newItemQtyInputRef.current?.focus(), 250);
      }
    },
    [
      findItemByScannedBarcode,
      soundEnabled,
      calculateSystemStock,
      selectedWarehouse,
      scanMode,
      getSectionName,
      getSubGroupName,
      toast
    ]
  );

  // تعديل كمية الصنف مباشرة من داخل نافذة الكاميرا أو الجدول
  const handleDirectQtyChange = useCallback((itemId: string, newActualQty: number) => {
    const safeQty = Math.max(0, Number(newActualQty.toFixed(3)));
    setItems((prev) =>
      prev.map((row) => {
        if (row.itemId !== itemId) return row;
        return {
          ...row,
          actualQty: safeQty,
          difference: Number((safeQty - row.systemQty).toFixed(3))
        };
      })
    );
    setLastScannedItem((prev) =>
      prev && prev.itemId === itemId ? { ...prev, totalActualQty: safeQty } : prev
    );
  }, []);

  // تشغيل وإدارة الكاميرا الحية عبر @zxing/browser
  useEffect(() => {
    let isMounted = true;

    const stopScanner = () => {
      if (zxingControlsRef.current) {
        try {
          zxingControlsRef.current.stop();
        } catch {}
        zxingControlsRef.current = null;
      }
      if (scannerVideoRef.current?.srcObject) {
        const stream = scannerVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        scannerVideoRef.current.srcObject = null;
      }
    };

    const startScanner = async () => {
      if (!isScannerOpen || !scannerVideoRef.current) return;

      try {
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
          await Promise.all([
            import("@zxing/browser"),
            import("@zxing/library"),
          ]);

        if (!isMounted || !scannerVideoRef.current) return;

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
            ? { deviceId: { exact: selectedCameraId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        };

        const controls = await codeReader.decodeFromConstraints(
          constraints,
          scannerVideoRef.current,
          (result) => {
            if (!isMounted || !result) return;
            handleScanSuccess(result.getText());
          }
        );

        if (!isMounted) {
          controls.stop();
          return;
        }

        zxingControlsRef.current = controls;
        setHasCameraPermission(true);

        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          if (isMounted && devices.length > 0) {
            setAvailableCameras(
              devices.map((d) => ({
                id: d.deviceId,
                label: d.label || `كاميرا ${d.deviceId.slice(0, 4)}`,
              }))
            );
          }
        } catch {}
      } catch (err: any) {
        console.warn("Live camera stream not available:", err);
        if (isMounted) setHasCameraPermission(false);
      }
    };

    if (isScannerOpen) {
      const timer = setTimeout(startScanner, 120);
      return () => {
        isMounted = false;
        clearTimeout(timer);
        setTorchOn(false);
        stopScanner();
      };
    }
  }, [isScannerOpen, selectedCameraId, handleScanSuccess]);

  // تشغيل/إيقاف كشاف الكاميرا (Torch)
  const toggleTorch = async () => {
    try {
      const nextState = !torchOn;
      if (zxingControlsRef.current?.switchTorch) {
        await zxingControlsRef.current.switchTorch(nextState);
        setTorchOn(nextState);
        return;
      }
      const stream = scannerVideoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0];
      if (track) {
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any]
        });
        setTorchOn(nextState);
      }
    } catch {
      toast({
        variant: "destructive",
        title: "الكشاف غير مدعوم",
        description: "عدسة الكاميرا الحالية لا تدعم تشغيل الفلاش أثناء المسح."
      });
    }
  };

  // مسح الباركود من صورة ملتقطة بكاميرا الموبايل الأصلية (يعمل حتى بدون HTTPS)
  const handleCameraPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(imageUrl);
      const decodedText = result?.getText();
      if (decodedText) {
        handleScanSuccess(decodedText, true);
      }
    } catch {
      toast({
        variant: "destructive",
        title: "لم يتم العثور على باركود واضح",
        description: "يرجى تقريب الكاميرا من الباركود والتأكد من وضوح الإضاءة ثم المحاولة مرة أخرى."
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
      e.target.value = "";
    }
  };

  const availableItemsForCombobox = useMemo(() => {
    return availableItems.map((item: Item) => ({
      value: item.id,
      label: `${item.name} (${item.code || "بدون كود"})`
    }));
  }, [availableItems]);

  const handleDownloadTemplate = () => {
    const data = availableItems.map((item: Item) => ({
      Code: item.code || item.id,
      Name: item.name,
      Section: getSectionName(item.sectionId),
      SubGroup: getSubGroupName(item),
      Unit: item.unit || item.baseUnit || "قطعة",
      SystemQuantity: selectedWarehouse ? calculateSystemStock(item.id, selectedWarehouse) : 0,
      ActualQuantity: ""
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "InventoryCount");
    XLSX.writeFile(workbook, `InventoryCountTemplate_${selectedWarehouse || "Scope"}.xlsx`);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedWarehouse) {
      toast({ variant: "destructive", title: "خطأ", description: "يرجى اختيار المخزن أولاً." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet);

        const newItems: AdjustmentItem[] = json
          .map((row): AdjustmentItem | null => {
            const itemCode = String(row["Code"] || "").trim();
            const item = (allItems || []).find(
              (i: Item) => String(i.code).trim() === itemCode || String(i.id).trim() === itemCode
            );
            if (!item) return null;

            const actualQty = Number(row["ActualQuantity"]) || 0;
            const systemQty = calculateSystemStock(item.id, selectedWarehouse);
            const difference = Number((actualQty - systemQty).toFixed(3));

            return {
              itemId: item.id,
              itemName: item.name,
              itemCode: item.code || "",
              sectionName: getSectionName(item.sectionId),
              subGroupName: getSubGroupName(item),
              systemQty,
              actualQty,
              difference,
              uniqueId: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
            };
          })
          .filter((item): item is AdjustmentItem => item !== null);

        setItems(newItems);
        toast({ title: "تمت قراءة الملف", description: `تمت معالجة ${newItems.length} صنف بنجاح.` });
      } catch {
        toast({ variant: "destructive", title: "خطأ في الملف", description: "لا يمكن قراءة ملف الإكسيل." });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleAddItem = () => {
    if (!newItem.itemId || !selectedWarehouse) {
      toast({ variant: "destructive", title: "خطأ", description: "يرجى اختيار المخزن والصنف." });
      return;
    }

    const existingItem = items.find((i) => i.itemId === newItem.itemId);
    if (existingItem) {
      setDuplicateItemInfo({ item: existingItem, newQty: newItem.actualQty });
      return;
    }

    const selectedItemData = (allItems || []).find((i: Item) => i.id === newItem.itemId);
    if (!selectedItemData) return;

    const systemQty = calculateSystemStock(newItem.itemId, selectedWarehouse);
    const difference = Number((newItem.actualQty - systemQty).toFixed(3));

    setItems([
      {
        itemId: selectedItemData.id,
        itemName: selectedItemData.name,
        itemCode: selectedItemData.code || "",
        sectionName: getSectionName(selectedItemData.sectionId),
        subGroupName: getSubGroupName(selectedItemData),
        systemQty,
        actualQty: newItem.actualQty,
        difference,
        uniqueId: `${selectedItemData.id}-${Date.now()}`
      },
      ...items
    ]);
    setNewItem({ itemId: "", actualQty: 0 });
  };

  const handleUpdateDuplicate = () => {
    if (!duplicateItemInfo) return;
    const { item, newQty } = duplicateItemInfo;
    handleDirectQtyChange(item.itemId, newQty);
    setNewItem({ itemId: "", actualQty: 0 });
    setDuplicateItemInfo(null);
  };

  const handleRemoveItem = (uniqueId: string) => {
    setItems((prev) => prev.filter((item) => item.uniqueId !== uniqueId));
  };

  // وصف نطاق الجرد الحالي لحفظه في الملاحظات والتقارير
  const scopeSummaryLabel = useMemo(() => {
    const parts: string[] = [];
    if (isSelectedMainWarehouse) {
      parts.push("مخزن رئيسي");
      if (selectedWarehouseSection !== "all") {
        const sec = warehouseInternalSections.find((s: any) => s.id === selectedWarehouseSection);
        if (sec) parts.push(`حاوية/قسم: ${sec.name}`);
      }
    } else if (selectedWarehouse) {
      parts.push("مخزن فرعي");
    }

    if (catalogScope === "section" && selectedSectionId !== "all") {
      parts.push(`القسم السلعي: ${getSectionName(selectedSectionId)}`);
    } else if (catalogScope === "category" && selectedCategoryId !== "all") {
      const cat = (itemCategories || []).find((c: any) => c.id === selectedCategoryId);
      if (cat) parts.push(`الفئة: ${cat.name}`);
    } else if (catalogScope === "sub_group" && selectedSubGroupId !== "all") {
      const sg = subGroupOptions.find((o) => o.value === selectedSubGroupId);
      if (sg) parts.push(sg.label);
    } else {
      parts.push("شامل كل التصنيفات");
    }
    return parts.join(" | ");
  }, [
    isSelectedMainWarehouse,
    selectedWarehouseSection,
    warehouseInternalSections,
    selectedWarehouse,
    catalogScope,
    selectedSectionId,
    selectedCategoryId,
    selectedSubGroupId,
    getSectionName,
    itemCategories,
    subGroupOptions
  ]);

  const filteredTableItems = useMemo(() => {
    if (!tableSearch.trim()) return items;
    const q = tableSearch.toLowerCase().trim();
    return items.filter(
      (i) =>
        i.itemName.toLowerCase().includes(q) ||
        (i.itemCode && i.itemCode.toLowerCase().includes(q)) ||
        (i.sectionName && i.sectionName.toLowerCase().includes(q)) ||
        (i.subGroupName && i.subGroupName.toLowerCase().includes(q))
    );
  }, [items, tableSearch]);

  const handleConfirm = async () => {
    if (!selectedWarehouse || items.length === 0) {
      toast({
        variant: "destructive",
        title: "بيانات غير مكتملة",
        description: "يرجى اختيار المخزن وإضافة صنف واحد على الأقل للجرد."
      });
      return;
    }

    const itemsToSave = items.filter(
      (item) => item.difference !== 0 || adjustmentType === "opening_balance"
    );

    if (itemsToSave.length === 0) {
      toast({
        title: "الأرصدة مطابقة تماماً",
        description: "جميع الكميات الفعلية مطابقة للرصيد الدفتري ولا توجد فروقات للتسوية."
      });
      return;
    }

    setIsSaving(true);

    try {
      const nextId = await getNextId("stockAdjustment");
      const now = new Date();
      const todayYMD = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const effectiveDateStr = activeSession?.snapshotDateStr || adjustmentDate;
      const recordDate =
        effectiveDateStr && (effectiveDateStr !== todayYMD || activeSession)
          ? new Date(`${effectiveDateStr}T12:00:00`)
          : now;
      const receiptNumber = `ت-م-${nextId}`;

      const sessionTag = activeSession
        ? ` [جلسة: ${activeSession.sessionCode} | تجميع ${activeSession.sheets.length} كشف جهاز | تاريخ التجنيب: ${activeSession.snapshotDateStr}]`
        : "";
      const finalNotes = `[نطاق الجرد: ${scopeSummaryLabel}]${sessionTag}${notes ? ` - ${notes}` : ""}`;

      const record = {
        warehouseId: selectedWarehouse,
        warehouseSectionId: selectedWarehouseSection !== "all" ? selectedWarehouseSection : undefined,
        catalogScope,
        date: recordDate.toISOString(),
        items: itemsToSave.map((item) => ({
          itemId: item.itemId,
          name: item.itemName,
          difference: item.difference,
          actualQty: item.actualQty,
          systemQty: item.systemQty,
          cost: (allItems || []).find((i: any) => i.id === item.itemId)?.cost || 0
        })),
        notes: finalNotes,
        reason: adjustmentType,
        receiptNumber,
        createdById: user?.id,
        createdByName: user?.name
      };

      const savedRecordId = await dbAction("stockAdjustmentRecords", "add", record);

      if (activeSession) {
        if (isIndexedDbMode) {
          try {
            const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
            const allSess: InventoryCountSession[] = raw ? JSON.parse(raw) : [];
            const updated = allSess.map((s) =>
              s.id === activeSession.id
                ? { ...s, status: "consolidated" as const }
                : s
            );
            localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(updated));
          } catch {}
        } else {
          await fetch("/api/inventory/count-sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "consolidate_session",
              sessionId: activeSession.id,
              recordId: savedRecordId || receiptNumber
            })
          });
        }
      }

      toast({
        title: activeSession ? "تم تجميع كشوف الجرد وإضافة الأرصدة بنجاح" : "اكتملت عملية الجرد والتسوية",
        description: `تم حفظ إذن التسوية رقم: ${receiptNumber} (${itemsToSave.length} صنف) بتاريخ ${effectiveDateStr}`
      });
      router.push("/inventory/adjustment");
    } catch {
      toast({
        variant: "destructive",
        title: "خطأ في الحفظ",
        description: "فشل في حفظ إيصال التسوية المخزنية."
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- دوال جلسات الجرد المتعدد وتجنيب الأرصدة الدفترية ---
  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setIsConsolidatedPreview(false);
    setItems([]);
    if (sessionId === "direct") return;

    const sess = countSessions.find((s) => s.id === sessionId);
    if (!sess) return;
    setAdjustmentType(sess.adjustmentType || "periodic_count");
    setAdjustmentDate(sess.snapshotDateStr);
    setLocationType("all_warehouses");
    setBranchFilter("all");
    setSelectedWarehouse(sess.warehouseId);
    setSelectedWarehouseSection(sess.warehouseSectionId || "all");
  };

  const handleCreateFrozenSession = async () => {
    if (!selectedWarehouse) {
      toast({
        variant: "destructive",
        title: "اختر المخزن أولاً",
        description: "يرجى اختيار المخزن المراد تجنيب أرصدته الدفترية."
      });
      return;
    }
    if (!adjustmentDate) {
      toast({
        variant: "destructive",
        title: "حدد تاريخ التجنيب",
        description: "يرجى تحديد التاريخ الذي سيتم تجنيب الأرصدة الدفترية عليه."
      });
      return;
    }

    setIsSessionActionLoading(true);
    try {
      const asOfDateObj = new Date(`${adjustmentDate}T23:59:59.999`);
      const frozenBalances: Record<string, number> = {};

      // حساب وتجنيب الأرصدة الدفترية لجميع الأصناف في هذا التاريخ المحدد
      (allItems || [])
        .filter((item: Item) => item.itemType !== "manufactured")
        .forEach((item: Item) => {
          if (adjustmentType === "opening_balance") {
            frozenBalances[item.id] = 0;
          } else {
            frozenBalances[item.id] = calculateStockForItemInWarehouse(
              item.id,
              selectedWarehouse,
              allDataContext,
              asOfDateObj
            );
          }
        });

      const sessionCode = `جرد-${adjustmentDate}-${Math.floor(100 + Math.random() * 900)}`;
      const newId = `ics_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      if (isIndexedDbMode) {
        const newSession: InventoryCountSession = {
          id: newId,
          sessionCode,
          warehouseId: selectedWarehouse,
          warehouseSectionId: selectedWarehouseSection !== "all" ? selectedWarehouseSection : undefined,
          adjustmentType,
          snapshotDate: asOfDateObj.toISOString(),
          snapshotDateStr: adjustmentDate,
          catalogScope,
          scopeLabel: scopeSummaryLabel,
          frozenBalances,
          status: "open",
          createdById: user?.id,
          createdByName: user?.name,
          createdAt: new Date().toISOString(),
          sheets: []
        };
        const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
        const existing: InventoryCountSession[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify([newSession, ...existing]));
        await loadCountSessions();
        setActiveSessionId(newId);
      } else {
        const res = await fetch("/api/inventory/count-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_session",
            id: newId,
            sessionCode,
            warehouseId: selectedWarehouse,
            warehouseSectionId: selectedWarehouseSection,
            adjustmentType,
            snapshotDate: asOfDateObj.toISOString(),
            snapshotDateStr: adjustmentDate,
            catalogScope,
            scopeLabel: scopeSummaryLabel,
            frozenBalances,
            createdById: user?.id,
            createdByName: user?.name
          })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "فشل إنشاء جلسة التجنيب");
        await loadCountSessions();
        setActiveSessionId(json.id || newId);
      }

      setIsConsolidatedPreview(false);
      setItems([]);
      toast({
        title: "تم تجنيب الأرصدة الدفترية بنجاح",
        description: `تم تجميد الأرصدة الدفترية بتاريخ ${adjustmentDate} وفتح جلسة الجرد (${sessionCode}) لاستقبال كشوف الأجهزة.`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "خطأ في تجنيب الأرصدة",
        description: err?.message || "تعذر إنشاء جلسة تجنيب الأرصدة الدفترية."
      });
    } finally {
      setIsSessionActionLoading(false);
    }
  };

  const handleSubmitDeviceSheet = async () => {
    if (!activeSession) return;
    if (items.length === 0) {
      toast({
        variant: "destructive",
        title: "الكشف فارغ",
        description: "يرجى إضافة أصناف وكميات الجرد الفعلي لهذا الجهاز قبل الإرسال."
      });
      return;
    }

    setIsSessionActionLoading(true);
    try {
      const sheetPayload = {
        id: `icsh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sessionId: activeSession.id,
        deviceName: deviceName.trim() || `${user?.name || "جهاز جرد"}`,
        submittedById: user?.id,
        submittedByName: user?.name,
        items: items.map((i) => ({
          itemId: i.itemId,
          itemName: i.itemName,
          itemCode: i.itemCode,
          actualQty: i.actualQty
        })),
        notes,
        createdAt: new Date().toISOString()
      };

      if (isIndexedDbMode) {
        const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
        const existing: InventoryCountSession[] = raw ? JSON.parse(raw) : [];
        const updated = existing.map((s) =>
          s.id === activeSession.id ? { ...s, sheets: [...(s.sheets || []), sheetPayload] } : s
        );
        localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(updated));
      } else {
        const res = await fetch("/api/inventory/count-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_sheet",
            ...sheetPayload
          })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "فشل إرسال كشف الجرد");
      }

      await loadCountSessions();
      setItems([]);
      setNotes("");
      setIsConsolidatedPreview(false);
      toast({
        title: "تم حفظ كشف الجرد للجهاز",
        description: `تم إرسال كشف "${sheetPayload.deviceName}" (${sheetPayload.items.length} صنف) إلى الجلسة دون تعديل الأرصدة بعد.`
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "خطأ في إرسال الكشف",
        description: err?.message || "تعذر حفظ كشف الجرد."
      });
    } finally {
      setIsSessionActionLoading(false);
    }
  };

  const handleRemoveDeviceSheet = async (sheetId: string) => {
    if (!activeSession) return;
    setIsSessionActionLoading(true);
    try {
      if (isIndexedDbMode) {
        const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
        const existing: InventoryCountSession[] = raw ? JSON.parse(raw) : [];
        const updated = existing.map((s) =>
          s.id === activeSession.id
            ? { ...s, sheets: (s.sheets || []).filter((sh) => sh.id !== sheetId) }
            : s
        );
        localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(updated));
      } else {
        await fetch("/api/inventory/count-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "remove_sheet",
            sessionId: activeSession.id,
            sheetId
          })
        });
      }
      await loadCountSessions();
      setIsConsolidatedPreview(false);
      toast({ title: "تم حذف الكشف", description: "تمت إزالة كشف الجرد من الجلسة." });
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "تعذر حذف الكشف." });
    } finally {
      setIsSessionActionLoading(false);
    }
  };

  const handleConsolidatePreview = (includeUncountedWithFrozenBalance = false) => {
    if (!activeSession || activeSession.sheets.length === 0) {
      toast({
        variant: "destructive",
        title: "لا توجد كشوف جرد",
        description: "يجب إدخال كشف جرد واحد على الأقل من الأجهزة قبل التجميع."
      });
      return;
    }

    const aggregatedMap = new Map<string, number>();
    activeSession.sheets.forEach((sheet) => {
      (sheet.items || []).forEach((it) => {
        const prev = aggregatedMap.get(it.itemId) || 0;
        aggregatedMap.set(it.itemId, Number((prev + (Number(it.actualQty) || 0)).toFixed(3)));
      });
    });

    if (includeUncountedWithFrozenBalance) {
      Object.entries(activeSession.frozenBalances || {}).forEach(([itemId, qty]) => {
        if (!aggregatedMap.has(itemId) && Number(qty) !== 0) {
          aggregatedMap.set(itemId, 0);
        }
      });
    }

    const consolidatedItems: AdjustmentItem[] = [];
    aggregatedMap.forEach((totalActual, itemId) => {
      const itemData = (allItems || []).find((i: Item) => i.id === itemId);
      if (!itemData) return;
      const frozenSysQty =
        activeSession.adjustmentType === "opening_balance"
          ? 0
          : Number(activeSession.frozenBalances?.[itemId] ?? 0);
      const diff = Number((totalActual - frozenSysQty).toFixed(3));
      consolidatedItems.push({
        itemId,
        itemName: itemData.name,
        itemCode: itemData.code || "",
        sectionName: getSectionName(itemData.sectionId),
        subGroupName: getSubGroupName(itemData),
        systemQty: frozenSysQty,
        actualQty: totalActual,
        difference: diff,
        uniqueId: `${itemId}-cons-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
      });
    });

    setItems(consolidatedItems);
    setIsConsolidatedPreview(true);
    toast({
      title: "تم تجميع كشوف الأجهزة بنجاح",
      description: `تم تجميع ${activeSession.sheets.length} كشف جرد ومقارنتها بالأرصدة الدفترية المجنّبة بتاريخ ${activeSession.snapshotDateStr}. راجع الفروقات ثم اضغط اعتماد التجميع.`
    });
  };

  const handleCancelSession = async () => {
    if (!activeSession) return;
    setIsSessionActionLoading(true);
    try {
      if (isIndexedDbMode) {
        const raw = localStorage.getItem(LOCAL_SESSIONS_KEY);
        const existing: InventoryCountSession[] = raw ? JSON.parse(raw) : [];
        const updated = existing.map((s) =>
          s.id === activeSession.id ? { ...s, status: "cancelled" as const } : s
        );
        localStorage.setItem(LOCAL_SESSIONS_KEY, JSON.stringify(updated));
      } else {
        await fetch("/api/inventory/count-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel_session", sessionId: activeSession.id })
        });
      }
      await loadCountSessions();
      setActiveSessionId("direct");
      setIsConsolidatedPreview(false);
      setItems([]);
      toast({ title: "تم إلغاء الجلسة", description: "تم إغلاق جلسة الجرد دون تعديل الأرصدة." });
    } catch {
      toast({ variant: "destructive", title: "خطأ", description: "تعذر إلغاء الجلسة." });
    } finally {
      setIsSessionActionLoading(false);
    }
  };

  const stats = useMemo(() => {
    let surplusCount = 0;
    let deficitCount = 0;
    let matchedCount = 0;
    items.forEach((i) => {
      if (i.difference > 0) surplusCount++;
      else if (i.difference < 0) deficitCount++;
      else matchedCount++;
    });
    return { total: items.length, surplusCount, deficitCount, matchedCount };
  }, [items]);

  return (
    <>
      {/* عنصر مخفي لقراءة صور الباركود الملتقطة بكاميرا الهاتف */}
      <div id="reader-file-fallback" className="hidden" />
      <input
        ref={cameraFileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraPhotoCapture}
      />

      <AlertDialog open={!!duplicateItemInfo} onOpenChange={() => setDuplicateItemInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>الصنف مضاف بالفعل في قائمة الجرد</AlertDialogTitle>
            <AlertDialogDescription>
              الصنف &quot;{duplicateItemInfo?.item.itemName}&quot; موجود بكمية فعلية (
              {duplicateItemInfo?.item.actualQty}). هل تريد استبدال الكمية لتصبح ({duplicateItemInfo?.newQty}) أم إضافتها تراكمياً؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel onClick={() => setDuplicateItemInfo(null)}>إلغاء</AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={() => {
                if (duplicateItemInfo) {
                  handleDirectQtyChange(
                    duplicateItemInfo.item.itemId,
                    duplicateItemInfo.item.actualQty + duplicateItemInfo.newQty
                  );
                  setNewItem({ itemId: "", actualQty: 0 });
                  setDuplicateItemInfo(null);
                }
              }}
            >
              جمع تراكمي ({(duplicateItemInfo?.item.actualQty || 0) + (duplicateItemInfo?.newQty || 0)})
            </Button>
            <AlertDialogAction onClick={handleUpdateDuplicate}>
              استبدال بـ ({duplicateItemInfo?.newQty})
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* نافذة الجرد الذكي بالكاميرا (تدعم البث الحي + الكشاف + الالتقاط المباشر للموبايل) */}
      <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          <DialogHeader className="p-4 pb-3 bg-muted/40 border-b">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Camera className="h-5 w-5 text-primary" />
                الجرد الذكي بالكاميرا (Barcode & QR)
              </DialogTitle>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? "كتم الصوت" : "تشغيل الصوت"}
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={torchOn ? "default" : "ghost"}
                  className="h-8 w-8"
                  onClick={toggleTorch}
                  title="تشغيل الفلاش / الكشاف"
                >
                  <Flashlight className="h-4 w-4" />
                </Button>
                {availableCameras.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      const idx = availableCameras.findIndex((c) => c.id === selectedCameraId);
                      const nextCam = availableCameras[(idx + 1) % availableCameras.length];
                      if (nextCam) setSelectedCameraId(nextCam.id);
                    }}
                    title="تبديل عدسة الكاميرا"
                  >
                    <SwitchCamera className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <DialogDescription className="text-xs">
              وجّه كاميرا الموبايل نحو باركود الصنف أو الكرتونة ليتم الجرد تلقائياً.
            </DialogDescription>
          </DialogHeader>

          {/* اختيار نمط المسح */}
          <div className="grid grid-cols-2 gap-1.5 p-2 bg-muted/30 border-b text-xs">
            <button
              type="button"
              onClick={() => setScanMode("instant_increment")}
              className={cn(
                "py-1.5 px-2 rounded-md font-bold transition text-center",
                scanMode === "instant_increment"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              عدّ تراكمي مباشر (+1 تلقائي)
            </button>
            <button
              type="button"
              onClick={() => setScanMode("select_and_type")}
              className={cn(
                "py-1.5 px-2 rounded-md font-bold transition text-center",
                scanMode === "select_and_type"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              تحديد الصنف وكتابة الكمية
            </button>
          </div>

          <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
            <video ref={scannerVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            {hasCameraPermission === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 p-5 text-center gap-3">
                <Camera className="h-10 w-10 text-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">البث المباشر للكاميرا يتطلب إذن المتصفح أو التثبيت</p>
                  <p className="text-xs text-slate-300">
                    يمكنك الضغط على الزر بالأسفل لفتح كاميرا الهاتف الأصلية وتصوير الباركود مباشرة في أي وضع اتصال:
                  </p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="gap-2 font-bold w-full max-w-xs"
                  onClick={() => cameraFileInputRef.current?.click()}
                >
                  <ImagePlus className="h-5 w-5" />
                  التقاط الباركود بكاميرا الموبايل
                </Button>
              </div>
            )}
          </div>

          {/* بطاقة آخر صنف تم مسحه بالكاميرا مع تحكم فوري بالكمية */}
          {lastScannedItem && (
            <div className="p-3 bg-emerald-500/10 border-t border-emerald-500/30 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="font-bold text-sm truncate">{lastScannedItem.name}</p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  النظام: <strong className="font-mono">{lastScannedItem.systemQty}</strong> | أُضيف:{" "}
                  <strong className="text-emerald-600 font-mono">+{lastScannedItem.addedQty}</strong> ({lastScannedItem.unitLabel})
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() =>
                    handleDirectQtyChange(
                      lastScannedItem.itemId,
                      Math.max(0, lastScannedItem.totalActualQty - 1)
                    )
                  }
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Input
                  type="number"
                  className="w-16 h-8 text-center font-bold font-mono px-1"
                  value={lastScannedItem.totalActualQty}
                  onChange={(e) =>
                    handleDirectQtyChange(lastScannedItem.itemId, parseFloat(e.target.value) || 0)
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-8 w-8"
                  onClick={() =>
                    handleDirectQtyChange(lastScannedItem.itemId, lastScannedItem.totalActualQty + 1)
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-row justify-between items-center gap-2 p-3 border-t bg-muted/20">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => cameraFileInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              تصوير باركود
            </Button>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                تم جرد {items.length} صنف
              </Badge>
              <Button variant="default" size="sm" onClick={() => setIsScannerOpen(false)}>
                إغلاق الكاميرا
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageHeader title="تسوية وجرد المخزون الذكي">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="gap-1.5 font-bold shadow-sm"
            disabled={!selectedWarehouse}
            onClick={() => setIsScannerOpen(true)}
          >
            <Camera className="h-4 w-4" />
            جرد بالكاميرا
          </Button>
        </div>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-4 p-2 md:p-6">
        <Card>
          <CardHeader className="p-4 md:p-6 pb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg md:text-xl">إعداد نطاق الجرد والتسوية المخزنية</CardTitle>
                <CardDescription>
                  حدد مستوى الجرد (مخزن فرعي، مخزن رئيسي، حاوية، قسم سلعي، أو مجموعة فرعية) ثم ابدأ الجرد بالكاميرا أو الإدخال المباشر.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="w-fit text-xs py-1 px-3">
                {scopeSummaryLabel}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-4 md:p-6 pt-2">
            {loading ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* القسم التمهيدي: جلسات الجرد متعدد الأجهزة وتجنيب الأرصدة الدفترية */}
                <div className="p-3.5 rounded-xl border bg-amber-500/5 border-amber-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Users className="h-4 w-4 text-amber-600" />
                      <span>الجرد متعدد الأجهزة وتجنيب الأرصدة الدفترية ({countSessions.length} جلسة مفتوحة)</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={loadCountSessions}
                      disabled={isSessionsLoading}
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", isSessionsLoading && "animate-spin")} />
                      تحديث الجلسات
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs font-bold">اختر جلسة جرد مفتوحة (أو ابقِ على الجرد المباشر من جهاز واحد)</Label>
                      <Select value={activeSessionId} onValueChange={handleSelectSession}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">وضع الجرد المباشر (جهاز واحد — حفظ فوري)</SelectItem>
                          {countSessions.map((sess) => {
                            const whName =
                              (warehouses || []).find((w: any) => w.id === sess.warehouseId)?.name ||
                              (inventoryZones || []).find((z: any) => z.id === sess.warehouseId)?.name ||
                              sess.warehouseId;
                            return (
                              <SelectItem key={sess.id} value={sess.id}>
                                {sess.sessionCode} — {whName} | تاريخ التجنيب: {sess.snapshotDateStr} | ({sess.sheets?.length || 0} كشف جهاز)
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {activeSession && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold">اسم هذا الجهاز / القائم بالجرد</Label>
                        <Input
                          value={deviceName}
                          onChange={(e) => setDeviceName(e.target.value)}
                          placeholder="مثال: موبايل 1 - ممر A"
                          className="h-9 text-xs"
                        />
                      </div>
                    )}
                  </div>

                  {activeSession && (
                    <div className="p-3 rounded-lg border bg-background/80 space-y-3">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          <Lock className="h-4 w-4 shrink-0" />
                          <span>
                            الأرصدة الدفترية مجنّبة بتاريخ ({activeSession.snapshotDateStr}) — لن تتأثر بحركات المخزن الحالية.
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            className="h-8 text-xs gap-1.5 font-bold"
                            disabled={isSessionActionLoading || activeSession.sheets.length === 0}
                            onClick={() => handleConsolidatePreview(false)}
                          >
                            <FileCheck2 className="h-3.5 w-3.5" />
                            تجميع كشوف الأجهزة ({activeSession.sheets.length})
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs gap-1"
                            disabled={isSessionActionLoading || activeSession.sheets.length === 0}
                            onClick={() => handleConsolidatePreview(true)}
                          >
                            تجميع شامل (مع غير المجرود بصفر)
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-destructive hover:text-destructive"
                            disabled={isSessionActionLoading}
                            onClick={handleCancelSession}
                          >
                            إلغاء الجلسة
                          </Button>
                        </div>
                      </div>

                      {activeSession.sheets.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {activeSession.sheets.map((sheet) => {
                            const totalQty = (sheet.items || []).reduce(
                              (sum, it) => sum + (Number(it.actualQty) || 0),
                              0
                            );
                            return (
                              <div
                                key={sheet.id}
                                className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/30 text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold truncate">{sheet.deviceName}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {sheet.items.length} صنف | إجمالي: {totalQty} | {sheet.submittedByName || "-"}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  disabled={isSessionActionLoading}
                                  onClick={() => handleRemoveDeviceSheet(sheet.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          لم يتم إرسال أي كشف جرد بعد في هذه الجلسة. قم بمسح الأصناف وإدخال الكميات أدناه ثم اضغط &quot;حفظ وإرسال كشف الجرد لهذا الجهاز&quot;.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* القسم الأول: تحديد المخزن (مخزن فرعي / مخزن رئيسي / حاوية) */}
                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-primary">
                      <WarehouseIcon className="h-4 w-4" />
                      <span>1. تحديد المكان المخزني وتاريخ تجنيب الأرصدة</span>
                    </div>
                    {!activeSession && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs gap-1.5 font-bold border border-amber-500/40"
                        disabled={!selectedWarehouse || !adjustmentDate || isSessionActionLoading}
                        onClick={handleCreateFrozenSession}
                      >
                        {isSessionActionLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-amber-600" />
                        )}
                        تجنيب الأرصدة الدفترية لهذا التاريخ وفتح جلسة جرد
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
                    <div className="space-y-1.5">
                      <Label className="text-xs">تاريخ / يوم الجرد</Label>
                      <Input
                        type="date"
                        value={adjustmentDate}
                        onChange={(e) => setAdjustmentDate(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">نوع التسوية</Label>
                      <Select
                        value={adjustmentType}
                        onValueChange={(v: any) => {
                          setAdjustmentType(v);
                          setItems([]);
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="periodic_count">جرد دوري (تسوية عجز / زيادة)</SelectItem>
                          <SelectItem value="opening_balance">جرد افتتاحي (رصيد أول مدة)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">مستوى المخزن</Label>
                      <Select
                        value={locationType}
                        onValueChange={(v: any) => {
                          setLocationType(v);
                          setSelectedWarehouse("");
                          setSelectedWarehouseSection("all");
                          setItems([]);
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all_warehouses">كل المخازن (الفرعية والرئيسية)</SelectItem>
                          <SelectItem value="branch_warehouse">مخزن فرعي / معرض</SelectItem>
                          <SelectItem value="main_warehouse">مخزن رئيسي / لوجيستي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">الفرع</Label>
                      <Combobox
                        options={branchOptions}
                        value={branchFilter}
                        onValueChange={(v) => {
                          setBranchFilter(v);
                          setSelectedWarehouse("");
                          setSelectedWarehouseSection("all");
                          setItems([]);
                        }}
                        placeholder="فلترة حسب الفرع..."
                        disabled={authorizedBranches.length === 1}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-primary">المخزن الخاضع للجرد *</Label>
                      <Combobox
                        options={warehouseOptions}
                        value={selectedWarehouse}
                        onValueChange={(v) => {
                          setSelectedWarehouse(v);
                          setSelectedWarehouseSection("all");
                          setItems([]);
                        }}
                        placeholder="اختر المخزن أو المخزن الرئيسي..."
                        emptyMessage="لا توجد مخازن مطابقة."
                      />
                    </div>
                  </div>

                  {/* إذا كان المخزن المختار مخزناً رئيسياً ويحتوي على أقسام/حاويات داخلية */}
                  {isSelectedMainWarehouse && warehouseInternalSections.length > 0 && (
                    <div className="pt-2 border-t flex flex-col sm:flex-row sm:items-center gap-3">
                      <Label className="text-xs font-bold text-foreground shrink-0">
                        تحديد قسم / حاوية داخل المخزن الرئيسي (اختياري):
                      </Label>
                      <div className="w-full sm:w-80">
                        <Select
                          value={selectedWarehouseSection}
                          onValueChange={(v) => {
                            setSelectedWarehouseSection(v);
                            setItems([]);
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="كل المخزن الرئيسي" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">كل المخزن الرئيسي بالكامل</SelectItem>
                            {warehouseInternalSections.map((sec: any) => (
                              <SelectItem key={sec.id} value={sec.id}>
                                حاوية / قسم: {sec.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                {/* القسم الثاني: تحديد نطاق الجرد التصنيفي (القسم السلعي / الفئة / المجموعة الفرعية) */}
                <div className="p-3.5 rounded-xl border bg-sky-500/5 border-sky-500/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground dark:text-foreground">
                      <FolderTree className="h-4 w-4" />
                      <span>2. نطاق الجرد حسب القسم أو المجموعة الفرعية ({availableItems.length} صنف متاح)</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs gap-1 font-bold"
                        disabled={!selectedWarehouse}
                        onClick={() => handleLoadScopeItems(true)}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        تحميل أصناف النطاق (بالرصيد الدفتري)
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs gap-1"
                        disabled={!selectedWarehouse}
                        onClick={() => handleLoadScopeItems(false)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        جرد أعمى (بصفر)
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <div className="space-y-1.5">
                      <Label className="text-xs">مستوى الجرد التصنيفي</Label>
                      <Select
                        value={catalogScope}
                        onValueChange={(v: any) => {
                          setCatalogScope(v);
                          setSelectedSectionId("all");
                          setSelectedCategoryId("all");
                          setSelectedSubGroupId("all");
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل الأصناف (جرد عام للمخزن)</SelectItem>
                          <SelectItem value="section">جرد على مستوى القسم (Section)</SelectItem>
                          <SelectItem value="category">جرد على مستوى الفئة الرئيسية</SelectItem>
                          <SelectItem value="sub_group">جرد على مستوى المجموعة الفرعية</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {catalogScope === "section" && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-bold">اختر القسم السلعي</Label>
                        <Combobox
                          options={sectionOptions}
                          value={selectedSectionId}
                          onValueChange={setSelectedSectionId}
                          placeholder="ابحث عن القسم..."
                        />
                      </div>
                    )}

                    {catalogScope === "category" && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-bold">اختر الفئة / التصنيف الرئيسي</Label>
                        <Combobox
                          options={categoryOptions}
                          value={selectedCategoryId}
                          onValueChange={setSelectedCategoryId}
                          placeholder="ابحث عن الفئة..."
                        />
                      </div>
                    )}

                    {catalogScope === "sub_group" && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs font-bold">اختر المجموعة الفرعية</Label>
                        <Combobox
                          options={subGroupOptions}
                          value={selectedSubGroupId}
                          onValueChange={setSelectedSubGroupId}
                          placeholder="ابحث عن المجموعة الفرعية..."
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">تصدير / استيراد إكسيل للنطاق</Label>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          onClick={handleDownloadTemplate}
                          disabled={!selectedWarehouse}
                          variant="outline"
                          size="sm"
                          className="flex-1 h-9 text-xs"
                        >
                          <Download className="ml-1 h-3.5 w-3.5" />
                          القالب
                        </Button>
                        <Input
                          id="file-upload"
                          type="file"
                          accept=".xlsx, .xls"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        <Label htmlFor="file-upload" className="flex-1">
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="w-full h-9 text-xs cursor-pointer"
                            disabled={!selectedWarehouse}
                          >
                            <span className="flex items-center justify-center">
                              <Upload className="ml-1 h-3.5 w-3.5" />
                              استيراد
                            </span>
                          </Button>
                        </Label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* القسم الثالث: الإضافة السريعة والمسح بالكاميرا */}
                <Card className="bg-muted/30 border-dashed">
                  <CardContent className="p-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-6 space-y-1.5">
                      <Label className="text-xs font-bold">إضافة صنف يدوياً أو بالكاميرا</Label>
                      <div className="flex gap-2">
                        <Combobox
                          options={availableItemsForCombobox}
                          value={newItem.itemId}
                          onValueChange={(v) => {
                            if (v) {
                              setNewItem({ ...newItem, itemId: v });
                              setTimeout(() => newItemQtyInputRef.current?.focus(), 100);
                            }
                          }}
                          placeholder="ابحث عن صنف بالاسم أو الباركود..."
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="default"
                          className="gap-1.5 px-3 shrink-0"
                          onClick={() => setIsScannerOpen(true)}
                          disabled={!selectedWarehouse}
                          title="مسح الباركود بالكاميرا"
                        >
                          <Camera className="h-4 w-4" />
                          <span className="hidden sm:inline text-xs font-bold">مسح بالكاميرا</span>
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="shrink-0"
                          onClick={() => cameraFileInputRef.current?.click()}
                          disabled={!selectedWarehouse}
                          title="تصوير باركود بكاميرا الموبايل"
                        >
                          <ImagePlus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="md:col-span-4 space-y-1.5">
                      <Label className="text-xs font-bold">الكمية الفعلية المكتشفة</Label>
                      <Input
                        ref={newItemQtyInputRef}
                        type="number"
                        placeholder="أدخل الكمية الفعلية..."
                        value={newItem.actualQty || ""}
                        onChange={(e) =>
                          setNewItem({ ...newItem, actualQty: parseFloat(e.target.value) || 0 })
                        }
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddItem();
                          }
                        }}
                        className="text-base h-9 font-bold font-mono"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Button
                        type="button"
                        onClick={handleAddItem}
                        className="w-full h-9 text-xs font-bold"
                        disabled={!selectedWarehouse || !newItem.itemId}
                      >
                        <PlusCircle className="ml-1.5 h-4 w-4" />
                        إضافة للجرد
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* شريط الإحصائيات والبحث في قائمة الجرد */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs py-1 px-2.5">
                      إجمالي الأصناف: <strong className="mr-1 font-mono">{stats.total}</strong>
                    </Badge>
                    <Badge variant="secondary" className="text-xs py-1 px-2.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      زيادة (+): <strong className="mr-1 font-mono">{stats.surplusCount}</strong>
                    </Badge>
                    <Badge variant="secondary" className="text-xs py-1 px-2.5 bg-destructive/10 text-destructive">
                      عجز (-): <strong className="mr-1 font-mono">{stats.deficitCount}</strong>
                    </Badge>
                    <Badge variant="secondary" className="text-xs py-1 px-2.5">
                      مطابق (0): <strong className="mr-1 font-mono">{stats.matchedCount}</strong>
                    </Badge>
                  </div>

                  {items.length > 0 && (
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="فلترة الأصناف المجرودة..."
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        className="h-8 pr-8 text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* عرض الأصناف المجرودة (متوافق مع الموبايل وسطح المكتب مع تعديل فوري للكمية) */}
                {isMobile ? (
                  <div className="space-y-2.5">
                    {filteredTableItems.map((item) => (
                      <Card key={item.uniqueId} className="relative overflow-hidden shadow-sm">
                        <div
                          className={cn(
                            "absolute right-0 top-0 bottom-0 w-1.5",
                            item.difference > 0
                              ? "bg-emerald-500"
                              : item.difference < 0
                                ? "bg-destructive"
                                : "bg-muted"
                          )}
                        />
                        <CardContent className="p-3 pr-4 space-y-2.5">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <div className="font-bold text-sm">{item.itemName}</div>
                              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-1.5 mt-0.5">
                                {item.itemCode && <span className="font-mono">#{item.itemCode}</span>}
                                {item.sectionName && item.sectionName !== "-" && (
                                  <span>• {item.sectionName}</span>
                                )}
                                {item.subGroupName && item.subGroupName !== "-" && (
                                  <span>• {item.subGroupName}</span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                              onClick={() => handleRemoveItem(item.uniqueId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-3 gap-2 items-center text-center text-xs">
                            <div className="bg-muted/60 p-1.5 rounded-md">
                              <p className="text-[10px] text-muted-foreground">الرصيد الدفتري</p>
                              <p className="font-bold font-mono text-sm">{item.systemQty}</p>
                            </div>

                            <div className="bg-primary/5 p-1 rounded-md border border-primary/20">
                              <p className="text-[10px] text-muted-foreground mb-0.5">الفعلي</p>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded bg-background border flex items-center justify-center font-bold"
                                  onClick={() =>
                                    handleDirectQtyChange(item.itemId, Math.max(0, item.actualQty - 1))
                                  }
                                >
                                  -
                                </button>
                                <Input
                                  type="number"
                                  value={item.actualQty}
                                  onChange={(e) =>
                                    handleDirectQtyChange(item.itemId, parseFloat(e.target.value) || 0)
                                  }
                                  className="h-6 w-14 text-center font-bold font-mono px-1 text-xs"
                                />
                                <button
                                  type="button"
                                  className="h-6 w-6 rounded bg-background border flex items-center justify-center font-bold"
                                  onClick={() => handleDirectQtyChange(item.itemId, item.actualQty + 1)}
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div
                              className={cn(
                                "p-1.5 rounded-md",
                                item.difference > 0
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : item.difference < 0
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted/40 text-muted-foreground"
                              )}
                            >
                              <p className="text-[10px]">الفرق</p>
                              <p className="font-bold font-mono text-sm">
                                {item.difference > 0 ? `+${item.difference}` : item.difference}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {filteredTableItems.length === 0 && (
                      <div className="text-center py-10 text-muted-foreground border rounded-lg">
                        <Boxes className="h-10 w-10 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">لم يتم إضافة أصناف للجرد بعد.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full overflow-auto border rounded-lg shadow-sm max-h-[460px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-[30%]">الصنف</TableHead>
                          <TableHead className="text-center">القسم / المجموعة</TableHead>
                          {adjustmentType === "periodic_count" && (
                            <TableHead className="text-center">الرصيد الدفتري</TableHead>
                          )}
                          <TableHead className="text-center w-[200px]">الكمية الفعلية</TableHead>
                          <TableHead className="text-center">الفرق</TableHead>
                          <TableHead className="text-center w-[70px]">حذف</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTableItems.map((item) => (
                          <TableRow key={item.uniqueId}>
                            <TableCell>
                              <div className="font-semibold text-sm">{item.itemName}</div>
                              {item.itemCode && (
                                <div className="text-[11px] font-mono text-muted-foreground">
                                  {item.itemCode}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-center text-xs text-muted-foreground">
                              <div>{item.sectionName || "-"}</div>
                              {item.subGroupName && item.subGroupName !== "-" && (
                                <div className="text-[10px] text-primary">{item.subGroupName}</div>
                              )}
                            </TableCell>
                            {adjustmentType === "periodic_count" && (
                              <TableCell className="text-center font-mono font-semibold text-muted-foreground">
                                {item.systemQty}
                              </TableCell>
                            )}
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  onClick={() =>
                                    handleDirectQtyChange(
                                      item.itemId,
                                      Math.max(0, item.actualQty - 1)
                                    )
                                  }
                                >
                                  <Minus className="h-3 w-3" />
                                </Button>
                                <Input
                                  type="number"
                                  value={item.actualQty}
                                  onChange={(e) =>
                                    handleDirectQtyChange(item.itemId, parseFloat(e.target.value) || 0)
                                  }
                                  className="h-8 w-20 text-center font-bold font-mono text-primary"
                                />
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  onClick={() => handleDirectQtyChange(item.itemId, item.actualQty + 1)}
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "text-center font-bold font-mono",
                                item.difference > 0
                                  ? "text-emerald-600"
                                  : item.difference < 0
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                              )}
                            >
                              {item.difference > 0 ? `+${item.difference}` : item.difference}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleRemoveItem(item.uniqueId)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredTableItems.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">
                              <Boxes className="h-10 w-10 mx-auto mb-2 opacity-20" />
                              لم يتم إضافة أي أصناف للجرد بعد. يمكنك الضغط على &quot;جرد بالكاميرا&quot; أو &quot;تحميل أصناف النطاق&quot;.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-bold">
                    ملاحظات إضافية على محضر الجرد
                  </Label>
                  <Textarea
                    id="notes"
                    placeholder="أضف أي ملاحظات حول لجنة الجرد أو سبب الفروقات..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </>
            )}
          </CardContent>

          <CardFooterUI className="flex flex-col md:flex-row justify-between gap-4 p-4 md:p-6 bg-muted/10 border-t">
            <div className="flex items-center gap-2 text-foreground text-xs md:text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {activeSession && !isConsolidatedPreview
                  ? `سيتم إرسال كشف الجرد الخاص بجهاز (${deviceName || "هذا الجهاز"}) إلى الجلسة (${activeSession.sessionCode}) دون تعديل أرصدة المخزن حتى يتم التجميع النهائي.`
                  : activeSession && isConsolidatedPreview
                    ? `معاينة التجميع النهائي لـ (${activeSession.sheets.length}) كشف جرد — سيتم اعتماد التسوية بتاريخ التجنيب (${activeSession.snapshotDateStr}).`
                    : `سيتم اعتماد فروقات الجرد للنطاق المحدد (${scopeSummaryLabel}) بتاريخ (${adjustmentDate}) وتحديث أرصدة المخزن فور الحفظ.`}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              {activeSession && !isConsolidatedPreview ? (
                <Button
                  size="lg"
                  className="w-full md:w-auto px-8 font-bold"
                  disabled={loading || isSessionActionLoading || items.length === 0}
                  onClick={handleSubmitDeviceSheet}
                >
                  {isSessionActionLoading ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ml-2 h-4 w-4" />
                  )}
                  حفظ وإرسال كشف الجرد لهذا الجهاز
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full md:w-auto px-8 font-bold"
                  disabled={loading || isSaving || items.length === 0}
                  onClick={handleConfirm}
                >
                  {isSaving ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ml-2 h-4 w-4" />
                  )}
                  {activeSession && isConsolidatedPreview
                    ? "اعتماد التجميع وإضافة الأرصدة"
                    : "تأكيد وحفظ محضر الجرد والتسوية"}
                </Button>
              )}
            </div>
          </CardFooterUI>
        </Card>
      </main>
    </>
  );
}
