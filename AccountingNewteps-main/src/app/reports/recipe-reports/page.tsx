"use client";

import React, { useMemo, useState } from "react";
import PageHeader from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { useData } from "@/contexts/data-provider";
import { 
  Loader2, Filter, Printer, Factory, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, XCircle, Package, ArrowUpRight, ArrowDownLeft,
  Trash2, ShoppingCart, ShoppingBag, Layers, Search, Eye, Scale, HelpCircle
} from "lucide-react";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ItemComponent {
  itemId: string;
  quantity: number;
}

interface Item {
  id: string;
  name: string;
  code?: string;
  cost?: number;
  price?: number;
  unit?: string;
  baseUnit?: string;
  itemType?: 'standard' | 'raw_material' | 'manufactured';
  components?: ItemComponent[];
}

export default function ManufacturingFeasibilityReportPage() {
  const { 
    salesInvoices, 
    posSales, 
    salesReturns, 
    posReturns, 
    purchaseInvoices, 
    purchaseReturns, 
    stockInRecords,
    stockOutRecords, 
    stockAdjustmentRecords,
    items: allItems, 
    warehouses, 
    loading 
  } = useData();

  // Filters state (Default to start of current month to current date)
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = now.toISOString().split('T')[0];

  const [filters, setFilters] = useState({
    fromDate: firstDayOfMonth,
    toDate: todayStr,
    warehouseId: 'all',
    feasibilityFilter: 'all', // 'all' | 'profitable' | 'review' | 'loss'
    searchQuery: '',
  });

  const [selectedProductForModal, setSelectedProductForModal] = useState<any | null>(null);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const warehouseOptions = useMemo(() => ([
    { value: 'all', label: 'كل الفروع والمستودعات' },
    ...warehouses.filter((w: any) => !w.isRepWarehouse).map((w: any) => ({ value: w.id, label: w.name }))
  ]), [warehouses]);

  // Master Items Lookup
  const itemsMap = useMemo(() => {
    const map = new Map<string, Item>();
    (allItems || []).forEach((item: Item) => map.set(item.id, item));
    return map;
  }, [allItems]);

  // Date Checker Helper
  const isDateInRange = (dateStr: string) => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const from = filters.fromDate ? new Date(filters.fromDate) : null;
    const to = filters.toDate ? new Date(filters.toDate) : null;
    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  // Warehouse Checker Helper
  const matchesWarehouse = (whId?: string) => {
    if (filters.warehouseId === 'all') return true;
    return whId === filters.warehouseId;
  };

  // -------------------------------------------------------------
  // 1. حساب مشتريات المواد الخام في الفترة (Raw Material Purchases)
  // -------------------------------------------------------------
  const rawMaterialPurchasesMap = useMemo(() => {
    const map = new Map<string, { purchasedQty: number; purchasedCost: number; returnQty: number; returnCost: number }>();

    // فواتير المشتريات
    (purchaseInvoices || []).forEach((inv: any) => {
      if (!isDateInRange(inv.date) || !matchesWarehouse(inv.warehouseId)) return;
      (inv.items || []).forEach((item: any) => {
        const id = item.id || item.itemId;
        const qty = Number(item.qty || item.quantity || 0);
        const cost = Number(item.total || (qty * Number(item.price || item.cost || 0)));
        const existing = map.get(id) || { purchasedQty: 0, purchasedCost: 0, returnQty: 0, returnCost: 0 };
        existing.purchasedQty += qty;
        existing.purchasedCost += cost;
        map.set(id, existing);
      });
    });

    // مرتجعات المشتريات
    (purchaseReturns || []).forEach((ret: any) => {
      if (!isDateInRange(ret.date) || !matchesWarehouse(ret.warehouseId)) return;
      (ret.items || []).forEach((item: any) => {
        const id = item.id || item.itemId;
        const qty = Number(item.qty || item.quantity || 0);
        const cost = Number(item.total || (qty * Number(item.price || item.cost || 0)));
        const existing = map.get(id) || { purchasedQty: 0, purchasedCost: 0, returnQty: 0, returnCost: 0 };
        existing.returnQty += qty;
        existing.returnCost += cost;
        map.set(id, existing);
      });
    });

    return map;
  }, [purchaseInvoices, purchaseReturns, filters]);

  // -------------------------------------------------------------
  // 2. حساب الإعدامات والتوالف في الفترة (Wastage & Damages)
  // -------------------------------------------------------------
  const wasteMap = useMemo(() => {
    const map = new Map<string, { wasteQty: number; wasteCost: number; details: any[] }>();

    // أذون الصرف المخزني اليدوي (تالف، هالك، إعدام)
    (stockOutRecords || []).forEach((rec: any) => {
      if (!isDateInRange(rec.date) || !matchesWarehouse(rec.sourceId || rec.warehouseId)) return;
      if (['draft', 'pending', 'cancelled', 'void'].includes(String(rec.status || '').toLowerCase())) return;
      const reason = (rec.reason || '').toLowerCase();
      if (reason.includes('manufacturing_issue')) {
        (rec.items || []).forEach((item: any) => {
          const id = item.id || item.itemId;
          const qty = Number(item.wasteQty || 0);
          if (!id || qty <= 0) return;
          const unitCost = Number(item.cost || itemsMap.get(id)?.cost || 0);
          const existing = map.get(id) || { wasteQty: 0, wasteCost: 0, details: [] };
          existing.wasteQty += qty;
          existing.wasteCost += qty * unitCost;
          existing.details.push({ date: rec.date, receiptNumber: rec.receiptNumber || 'صرف تصنيع', reason: 'هدر خامات تصنيع', qty, cost: qty * unitCost });
          map.set(id, existing);
        });
        return;
      }
      // نعتبر أي صرف للتلف أو الهالك أو الإعدام أو الاستخدام الداخلي كفقد تصنيعي
      const isWaste = reason.includes('تالف') || reason.includes('هالك') || reason.includes('إعدام') || reason.includes('عجز') || reason.includes('damage') || reason.includes('waste');
      if (!isWaste) return;

      (rec.items || []).forEach((item: any) => {
        const id = item.id || item.itemId;
        const masterItem = itemsMap.get(id);
        const qty = Number(item.qty || 0);
        const unitCost = Number(masterItem?.cost || 0);
        const cost = qty * unitCost;

        const existing = map.get(id) || { wasteQty: 0, wasteCost: 0, details: [] };
        existing.wasteQty += qty;
        existing.wasteCost += cost;
        existing.details.push({
          date: rec.date,
          receiptNumber: rec.receiptNumber || 'إذن صرف',
          reason: rec.reason || 'إعدام / تالف',
          qty,
          cost
        });
        map.set(id, existing);
      });
    });

    // عجز التسويات الجردية
    (stockAdjustmentRecords || []).forEach((adj: any) => {
      if (!isDateInRange(adj.date) || !matchesWarehouse(adj.warehouseId)) return;
      (adj.items || []).forEach((item: any) => {
        const diff = Number(item.difference || 0);
        if (diff < 0) { // عجز جرد
          const id = item.id || item.itemId;
          const masterItem = itemsMap.get(id);
          const qty = Math.abs(diff);
          const unitCost = Number(masterItem?.cost || 0);
          const cost = qty * unitCost;

          const existing = map.get(id) || { wasteQty: 0, wasteCost: 0, details: [] };
          existing.wasteQty += qty;
          existing.wasteCost += cost;
          existing.details.push({
            date: adj.date,
            receiptNumber: adj.receiptNumber || 'تسوية جردية',
            reason: 'عجز تسوية جردية',
            qty,
            cost
          });
          map.set(id, existing);
        }
      });
    });

    return map;
  }, [stockOutRecords, stockAdjustmentRecords, itemsMap, filters]);

  // -------------------------------------------------------------
  // 3. تحليل مبيعات وأرباح وجدوى كل منتج مصنّع (Manufactured Goods)
  // -------------------------------------------------------------
  const { manufacturedProductsData, rawMaterialsSummaryData, kpis } = useMemo(() => {
    // تحديد الأصناف المصنعة
    const manufacturedItems = (allItems || []).filter((item: Item) => 
      item.itemType === 'manufactured' || (item.components && item.components.length > 0)
    );

    // تجميع مبيعات المنتجات في الفترة (Sales Invoices + POS Sales)
    const productSalesMap = new Map<string, { soldQty: number; salesRevenue: number }>();
    const seenSaleIds = new Set<string>();

    (salesInvoices || []).forEach((inv: any) => {
      if ((inv.status && inv.status !== 'approved' && inv.status !== 'completed')) return;
      if (!isDateInRange(inv.date) || !matchesWarehouse(inv.warehouseId)) return;
      if (inv.id) seenSaleIds.add(inv.id);

      (inv.items || []).forEach((item: any) => {
        const id = item.id || item.itemId;
        const qty = Number(item.qty || 0);
        const revenue = Number(item.total || (qty * Number(item.price || 0)));
        const existing = productSalesMap.get(id) || { soldQty: 0, salesRevenue: 0 };
        existing.soldQty += qty;
        existing.salesRevenue += revenue;
        productSalesMap.set(id, existing);
      });
    });

    (posSales || []).forEach((pos: any) => {
      if (pos.id && seenSaleIds.has(pos.id)) return;
      if (!isDateInRange(pos.date) || !matchesWarehouse(pos.warehouseId)) return;

      (pos.items || []).forEach((item: any) => {
        const id = item.id || item.itemId;
        const qty = Number(item.qty || 0);
        const revenue = Number(item.total || (qty * Number(item.price || 0)));
        const existing = productSalesMap.get(id) || { soldQty: 0, salesRevenue: 0 };
        existing.soldQty += qty;
        existing.salesRevenue += revenue;
        productSalesMap.set(id, existing);
      });
    });

    // خصم مرتجعات المبيعات
    const seenReturnIds = new Set<string>();
    (salesReturns || []).forEach((ret: any) => {
      if (!isDateInRange(ret.date) || !matchesWarehouse(ret.warehouseId)) return;
      if (ret.id) seenReturnIds.add(ret.id);
      (ret.items || []).forEach((item: any) => {
        const id = item.id || item.itemId;
        const qty = Number(item.qty || 0);
        const revenue = Number(item.total || (qty * Number(item.price || 0)));
        const existing = productSalesMap.get(id) || { soldQty: 0, salesRevenue: 0 };
        existing.soldQty = Math.max(0, existing.soldQty - qty);
        existing.salesRevenue = Math.max(0, existing.salesRevenue - revenue);
        productSalesMap.set(id, existing);
      });
    });

    (posReturns || []).forEach((pret: any) => {
      if (pret.id && seenReturnIds.has(pret.id)) return;
      if (!isDateInRange(pret.date) || !matchesWarehouse(pret.warehouseId)) return;
      (pret.items || []).forEach((item: any) => {
        const id = item.id || item.itemId;
        const qty = Number(item.qty || 0);
        const revenue = Number(item.total || (qty * Number(item.price || 0)));
        const existing = productSalesMap.get(id) || { soldQty: 0, salesRevenue: 0 };
        existing.soldQty = Math.max(0, existing.soldQty - qty);
        existing.salesRevenue = Math.max(0, existing.salesRevenue - revenue);
        productSalesMap.set(id, existing);
      });
    });

    // خريطة لتجميع استهلاك المواد الخام التراكمي عبر كل المنتجات
    const rawMaterialConsumptionMap = new Map<string, { consumedQty: number; consumedCost: number; usedInProducts: string[] }>();
    const actualProductionCostMap = new Map<string, { qty: number; cost: number; wasteCost: number; wasteQty: number; normalScrapQty: number; abnormalScrapQty: number; allocatedWasteCost: number; weightedAllocatedWastePerUnit: number; batches: any[] }>();
    const actualMaterialCostByProduct = new Map<string, number>();
    const actualIssueProductIds = new Set<string>();

    (stockInRecords || []).forEach((record: any) => {
      if (!isDateInRange(record.date) || !matchesWarehouse(record.warehouseId)) return;
      const lines = record.items || [];
      if (!String(record.reason || '').toLowerCase().includes('manufacturing_output') && !lines.some((line: any) => line.manufacturingOrderId && line.batchNumber)) return;
      lines.forEach((line: any) => {
        const itemId = String(line.itemId || line.id || '');
        if (!itemId || !itemsMap.has(itemId)) return;
        const qty = Number(line.qty || line.quantity || 0);
        const unitCost = Number(line.cost || 0);
        const batchNumber = line.batchNumber || record.batchNumber || '';
        const data = actualProductionCostMap.get(itemId) || { qty: 0, cost: 0, wasteCost: 0, wasteQty: 0, normalScrapQty: 0, abnormalScrapQty: 0, allocatedWasteCost: 0, weightedAllocatedWastePerUnit: 0, batches: [] };
        data.qty += qty;
        data.cost += qty * unitCost;
        data.wasteCost += Number(line.damagedCost || 0) + (line.wasteTreatment === 'expense' ? Number(line.wastedMaterialCost || 0) : 0);
        data.wasteQty += Number(line.damagedQty || 0);
        data.normalScrapQty += Number(line.normalScrapQty || 0);
        data.abnormalScrapQty += Number(line.abnormalScrapQty || 0);
        const allocatedWasteCost = Number(line.allocatedWasteCost || 0);
        const allocatedWasteCostPerUnit = Number(line.allocatedWasteCostPerUnit || 0);
        data.allocatedWasteCost += allocatedWasteCost;
        data.weightedAllocatedWastePerUnit += allocatedWasteCostPerUnit * qty;
        if (batchNumber) data.batches.push({ batchNumber, qty, unitCost, salePrice: Number(line.salePrice || 0), margin: line.manufacturingProfitMargin == null ? null : Number(line.manufacturingProfitMargin), normalScrapQty: Number(line.normalScrapQty || 0), abnormalScrapQty: Number(line.abnormalScrapQty || 0), normalScrapCost: Number(line.normalScrapCost || 0), allocatedWasteCost, allocatedWasteCostPerUnit, wasteTreatment: line.wasteTreatment, date: record.date });
        actualProductionCostMap.set(itemId, data);
      });
    });

    (stockOutRecords || []).forEach((record: any) => {
      if (!String(record.reason || '').toLowerCase().includes('manufacturing_issue') || !isDateInRange(record.date) || !matchesWarehouse(record.sourceId || record.warehouseId)) return;
      if (['draft', 'pending', 'cancelled', 'void'].includes(String(record.status || '').toLowerCase())) return;
      (record.items || []).forEach((line: any) => {
        const itemId = String(line.itemId || line.id || '');
        const qty = Number(line.usedQty ?? Math.max(0, Number(line.qty || 0) - Number(line.wasteQty || 0) - Number(line.returnedQty || 0)));
        if (!itemId || qty <= 0) return;
        const unitCost = Number(line.cost || itemsMap.get(itemId)?.cost || 0);
        if (line.productionItemId) {
          const productId = String(line.productionItemId);
          actualIssueProductIds.add(productId);
          actualMaterialCostByProduct.set(productId, (actualMaterialCostByProduct.get(productId) || 0) + qty * unitCost);
        }
        const existing = rawMaterialConsumptionMap.get(itemId) || { consumedQty: 0, consumedCost: 0, usedInProducts: [] };
        existing.consumedQty += qty;
        existing.consumedCost += qty * unitCost;
        if (line.productionItemId) {
          const productName = itemsMap.get(String(line.productionItemId))?.name || String(line.productionItemId);
          if (!existing.usedInProducts.includes(productName)) existing.usedInProducts.push(productName);
        }
        rawMaterialConsumptionMap.set(itemId, existing);
      });
    });

    // معالجة كل منتج مصنّع واحتساب تكاليف خاماته وأرباحه
    const productsAnalysis = manufacturedItems.map((prod: Item) => {
      const sales = productSalesMap.get(prod.id) || { soldQty: 0, salesRevenue: 0 };
      const waste = wasteMap.get(prod.id) || { wasteQty: 0, wasteCost: 0, details: [] };
      const actualProduction = actualProductionCostMap.get(prod.id);
      const actualUnitProductionCost = actualProduction && actualProduction.qty > 0 ? actualProduction.cost / actualProduction.qty : 0;

      // تحليل المكونات المستهلكة لإنتاج الكمية المباعة
      let totalMaterialCostForSold = actualUnitProductionCost > 0 ? sales.soldQty * actualUnitProductionCost : 0;
      const componentsBreakdown = (prod.components || []).map(comp => {
        const rawItem = itemsMap.get(comp.itemId);
        const unitRequired = Number(comp.quantity || 0);
        const totalRawQtyUsed = sales.soldQty * unitRequired;
        const rawUnitCost = Number(rawItem?.cost || 0);
        const totalRawCost = totalRawQtyUsed * rawUnitCost;

        if (!actualUnitProductionCost) totalMaterialCostForSold += totalRawCost;

        // تسجيل الاستهلاك في الخريطة الشاملة للخامات
        if (!actualIssueProductIds.has(prod.id) && totalRawQtyUsed > 0) {
          const rawExisting = rawMaterialConsumptionMap.get(comp.itemId) || { consumedQty: 0, consumedCost: 0, usedInProducts: [] };
          rawExisting.consumedQty += totalRawQtyUsed;
          rawExisting.consumedCost += totalRawCost;
          if (!rawExisting.usedInProducts.includes(prod.name)) {
            rawExisting.usedInProducts.push(prod.name);
          }
          rawMaterialConsumptionMap.set(comp.itemId, rawExisting);
        }

        return {
          itemId: comp.itemId,
          name: rawItem?.name || 'مادة خام غير معروفة',
          code: rawItem?.code || 'N/A',
          unit: rawItem?.unit || rawItem?.baseUnit || 'وحدة',
          unitRequired,
          unitCost: rawUnitCost,
          totalQtyUsed: totalRawQtyUsed,
          totalCost: totalRawCost
        };
      });

      // صافي ربح التصنيع = الإيراد - تكلفة الخامات المستهلكة - تكلفة إعدام المنتج النهائي
      const totalWasteCostForProduct = waste.wasteCost + (actualProduction?.wasteCost || 0);
      const netManufacturingProfit = sales.salesRevenue - totalMaterialCostForSold - totalWasteCostForProduct;
      const marginPercentage = sales.salesRevenue > 0 ? (netManufacturingProfit / sales.salesRevenue) * 100 : 0;
      const latestBatch = actualProduction?.batches[actualProduction.batches.length - 1];
      const manufacturingProfitMargin = latestBatch
        ? (latestBatch.margin ?? (Number(prod.price) > 0 ? (Number(prod.price) - actualUnitProductionCost) / Number(prod.price) * 100 : 0))
        : 0;
      const suggestedSalePrice = latestBatch?.salePrice > 0
        ? latestBatch.salePrice
        : actualUnitProductionCost > 0 && manufacturingProfitMargin < 100
          ? actualUnitProductionCost / (1 - manufacturingProfitMargin / 100)
          : 0;

      // تحديد مقياس الجدوى والاستمرارية
      let status: 'profitable' | 'review' | 'loss' = 'profitable';
      let statusLabel = 'استمر وتوسع 🚀';
      let statusBadgeClass = 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
      let recommendation = 'صنف عالي الربحية وهامش ممتاز. يُوصى بزيادة إنتاجه وتطوير تسويقه.';

      if (sales.salesRevenue === 0 && totalWasteCostForProduct > 0) {
        status = 'loss';
        statusLabel = 'هدر وتوالف دون مبيعات 🛑';
        statusBadgeClass = 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
        recommendation = 'يوجد إعدامات وتوالف على الصنف دون تحقيق أي مبيعات خلال الفترة. أوقف الإنتاج فوراً.';
      } else if (netManufacturingProfit <= 0 || marginPercentage < 8) {
        status = 'loss';
        statusLabel = 'غير مجدي / خاسر 🛑';
        statusBadgeClass = 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30';
        recommendation = 'تكلفة الخامات والهوالك تلتهم إيراد البيع بالكامل. أوقف التصنيع أو ارفع سعر البيع بما لا يقل عن 25%.';
      } else if (marginPercentage >= 8 && marginPercentage < 22) {
        status = 'review';
        statusLabel = 'يحتاج مراجعة تكاليف ⚠️';
        statusBadgeClass = 'bg-amber-500/15 text-foreground dark:text-foreground border-amber-500/30';
        recommendation = 'هامش الربح ضعيف أو نسبة الهدر مرتفعة. راجع فواتير شراء الخامات وتفاوض على أسعار أقل أو قلل الهوالك.';
      }

      return {
        id: prod.id,
        name: prod.name,
        code: prod.code || 'N/A',
        price: Number(prod.price || 0),
        soldQty: sales.soldQty,
        salesRevenue: sales.salesRevenue,
        materialCost: totalMaterialCostForSold,
        actualMaterialCost: actualMaterialCostByProduct.get(prod.id) || 0,
        producedQty: actualProduction?.qty || 0,
        actualProductionCost: actualProduction?.cost || 0,
        wasteQty: waste.wasteQty + (actualProduction?.wasteQty || 0),
        normalScrapQty: actualProduction?.normalScrapQty || 0,
        abnormalScrapQty: actualProduction?.abnormalScrapQty || 0,
        wasteCost: totalWasteCostForProduct,
        allocatedWasteCost: actualProduction?.allocatedWasteCost || 0,
        allocatedWasteCostPerUnit: actualProduction && actualProduction.qty > 0 ? actualProduction.weightedAllocatedWastePerUnit / actualProduction.qty : 0,
        manufacturingProfitMargin,
        suggestedSalePrice,
        batchNumbers: Array.from(new Set((actualProduction?.batches || []).map((batch: any) => batch.batchNumber))).join('، '),
        netManufacturingProfit,
        marginPercentage,
        status,
        statusLabel,
        statusBadgeClass,
        recommendation,
        componentsBreakdown,
        hasComponents: componentsBreakdown.length > 0
      };
    });

    // -------------------------------------------------------------
    // 4. تجميع مصفوفة المواد الخام (مشتريات vs استهلاك vs إعدام)
    // -------------------------------------------------------------
    // حصر كافة المواد الخام المعرفة أو الداخلة في المكونات
    const rawMaterialIds = new Set<string>();
    (allItems || []).forEach((item: Item) => {
      if (item.itemType === 'raw_material') rawMaterialIds.add(item.id);
      if (item.components) {
        item.components.forEach(c => rawMaterialIds.add(c.itemId));
      }
    });

    const rawMaterialsSummary = Array.from(rawMaterialIds).map(rawId => {
      const rawItem = itemsMap.get(rawId);
      const purchases = rawMaterialPurchasesMap.get(rawId) || { purchasedQty: 0, purchasedCost: 0, returnQty: 0, returnCost: 0 };
      const consumption = rawMaterialConsumptionMap.get(rawId) || { consumedQty: 0, consumedCost: 0, usedInProducts: [] };
      const waste = wasteMap.get(rawId) || { wasteQty: 0, wasteCost: 0, details: [] };

      const netPurchasedQty = Math.max(0, purchases.purchasedQty - purchases.returnQty);
      const netPurchasedCost = Math.max(0, purchases.purchasedCost - purchases.returnCost);
      const avgUnitCost = netPurchasedQty > 0 ? (netPurchasedCost / netPurchasedQty) : Number(rawItem?.cost || 0);

      const varianceQty = netPurchasedQty - (consumption.consumedQty + waste.wasteQty);
      const varianceCost = varianceQty * avgUnitCost;

      return {
        id: rawId,
        name: rawItem?.name || 'مادة خام غير مسماة',
        code: rawItem?.code || 'N/A',
        unit: rawItem?.unit || rawItem?.baseUnit || 'وحدة',
        netPurchasedQty,
        netPurchasedCost,
        consumedQty: consumption.consumedQty,
        consumedCost: consumption.consumedCost,
        wasteQty: waste.wasteQty,
        wasteCost: waste.wasteCost,
        varianceQty,
        varianceCost,
        usedInProducts: consumption.usedInProducts,
        wastePercentage: (netPurchasedQty > 0 && waste.wasteQty > 0) ? (waste.wasteQty / netPurchasedQty) * 100 : 0
      };
    });

    // -------------------------------------------------------------
    // 5. حساب إجماليات الـ KPIs العامة
    // -------------------------------------------------------------
    const totalPurchasedCost = rawMaterialsSummary.reduce((acc, r) => acc + r.netPurchasedCost, 0);
    const totalSalesRevenue = productsAnalysis.reduce((acc, p) => acc + p.salesRevenue, 0);
    const totalMaterialsConsumedCost = productsAnalysis.reduce((acc, p) => acc + p.materialCost, 0);
    const manufacturingRawWasteExpensed = (stockOutRecords || []).reduce((sum: number, record: any) => {
      if (!String(record.reason || '').toLowerCase().includes('manufacturing_issue') || !isDateInRange(record.date) || !matchesWarehouse(record.sourceId || record.warehouseId)) return sum;
      if (['draft', 'pending', 'cancelled', 'void'].includes(String(record.status || '').toLowerCase())) return sum;
      return sum + (record.items || []).reduce((lineSum: number, line: any) => lineSum + (line.wasteTreatment === 'expense' ? Number(line.wasteQty || 0) * Number(line.cost || 0) : 0), 0);
    }, 0);
    const totalWasteCost = productsAnalysis.reduce((acc, p) => acc + p.wasteCost, 0) + Math.max(0, rawMaterialsSummary.reduce((acc, r) => acc + r.wasteCost, 0) - manufacturingRawWasteExpensed);
    const totalNetManufacturingProfit = totalSalesRevenue - totalMaterialsConsumedCost - totalWasteCost;
    const overallMargin = totalSalesRevenue > 0 ? (totalNetManufacturingProfit / totalSalesRevenue) * 100 : 0;

    return {
      manufacturedProductsData: productsAnalysis,
      rawMaterialsSummaryData: rawMaterialsSummary,
      kpis: {
        totalPurchasedCost,
        totalSalesRevenue,
        totalMaterialsConsumedCost,
        totalWasteCost,
        totalNetManufacturingProfit,
        overallMargin,
        manufacturedItemsCount: manufacturedItems.length,
        profitableCount: productsAnalysis.filter(p => p.status === 'profitable').length,
        reviewCount: productsAnalysis.filter(p => p.status === 'review').length,
        lossCount: productsAnalysis.filter(p => p.status === 'loss').length,
      }
    };
  }, [allItems, itemsMap, salesInvoices, posSales, salesReturns, posReturns, stockInRecords, stockOutRecords, rawMaterialPurchasesMap, wasteMap]);

  // تطبيق فلاتر البحث والجدوى على قائمة المنتجات المصنعة
  const filteredProducts = useMemo(() => {
    return manufacturedProductsData.filter(prod => {
      if (filters.feasibilityFilter !== 'all' && prod.status !== filters.feasibilityFilter) return false;
      if (filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        const matchName = prod.name.toLowerCase().includes(query);
        const matchCode = prod.code.toLowerCase().includes(query);
        if (!matchName && !matchCode) return false;
      }
      return true;
    });
  }, [manufacturedProductsData, filters]);

  // تطبيق البحث على قائمة الخامات
  const filteredRawMaterials = useMemo(() => {
    return rawMaterialsSummaryData.filter(raw => {
      if (filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        const matchName = raw.name.toLowerCase().includes(query);
        const matchCode = raw.code.toLowerCase().includes(query);
        if (!matchName && !matchCode) return false;
      }
      return true;
    });
  }, [rawMaterialsSummaryData, filters]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col w-full min-h-full pb-10">
      {/* 1. Header with Title and Global Action Buttons */}
      <PageHeader 
        title="تقرير جدوى وأرباح التصنيع ومقارنة الخامات بالمنتجات النهائية"
        description="تحليل تكلفة الإنتاج الفعلية والتشغيلات والهدر وسعر البيع وهامش الربح لكل منتج مصنع."
      >
        <div className="flex items-center gap-2 flex-wrap no-print">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handlePrint} 
            className="gap-1.5 text-xs font-semibold h-8"
          >
            <Printer className="h-3.5 w-3.5 text-foreground" />
            طباعة التقرير
          </Button>
        </div>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-4 p-3 md:p-5 w-full">
        {/* 2. Filter Bar */}
        <Card className="border shadow-xs no-print">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Filter className="h-4 w-4 text-emerald-600" />
              محددات البحث والفترة الزمنية
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">من تاريخ</Label>
              <Input 
                type="date" 
                value={filters.fromDate} 
                onChange={e => handleFilterChange('fromDate', e.target.value)} 
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">إلى تاريخ</Label>
              <Input 
                type="date" 
                value={filters.toDate} 
                onChange={e => handleFilterChange('toDate', e.target.value)} 
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">الفرع / المستودع</Label>
              <Combobox
                options={warehouseOptions}
                value={filters.warehouseId}
                onValueChange={(v) => handleFilterChange('warehouseId', v)}
                placeholder="اختر الفرع..."
                emptyMessage="لا توجد فروع."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">بحث بالاسم أو الكود</Label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute right-2.5 top-2.5 text-muted-foreground" />
                <Input 
                  placeholder="ابحث عن صنف أو خامة..." 
                  value={filters.searchQuery} 
                  onChange={e => handleFilterChange('searchQuery', e.target.value)} 
                  className="h-8 text-xs pr-8"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Executive KPI Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Card 1: Raw Material Purchases */}
          <div className="p-3.5 rounded-xl border bg-card shadow-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>مشتريات الخامات</span>
              <ShoppingCart className="h-4 w-4 text-foreground" />
            </div>
            <div className="text-lg font-black font-mono text-foreground dark:text-foreground">
              {kpis.totalPurchasedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[10px] mr-1 text-muted-foreground font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-muted-foreground">إجمالي فواتير شراء الخامات</p>
          </div>

          {/* Card 2: Finished Goods Sales */}
          <div className="p-3.5 rounded-xl border bg-card shadow-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>مبيعات المصنعات</span>
              <ShoppingBag className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-400">
              {kpis.totalSalesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[10px] mr-1 text-muted-foreground font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-muted-foreground">إيراد بيع المنتجات النهائية</p>
          </div>

          {/* Card 3: Direct Material Cost */}
          <div className="p-3.5 rounded-xl border bg-card shadow-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>الخامات المستهلكة</span>
              <Layers className="h-4 w-4 text-foreground" />
            </div>
            <div className="text-lg font-black font-mono text-foreground dark:text-foreground">
              {kpis.totalMaterialsConsumedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[10px] mr-1 text-muted-foreground font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-muted-foreground">تكلفة المكونات الداخلة بالبيع</p>
          </div>

          {/* Card 4: Wastage & Write-offs */}
          <div className="p-3.5 rounded-xl border bg-card shadow-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>الهالك والإعدامات</span>
              <Trash2 className="h-4 w-4 text-rose-500" />
            </div>
            <div className="text-lg font-black font-mono text-rose-600 dark:text-rose-400">
              {kpis.totalWasteCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[10px] mr-1 text-muted-foreground font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-muted-foreground">توالف خامات ومنتجات تامة</p>
          </div>

          {/* Card 5: Net Manufacturing Profit */}
          <div className="p-3.5 rounded-xl border bg-card shadow-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>أرباح التصنيع الصافية</span>
              <Factory className="h-4 w-4 text-emerald-600" />
            </div>
            <div className={cn("text-lg font-black font-mono", kpis.totalNetManufacturingProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600")}>
              {kpis.totalNetManufacturingProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="text-[10px] mr-1 text-muted-foreground font-sans">ج.م</span>
            </div>
            <p className="text-[10px] text-muted-foreground">الإيراد - الخامات - الإعدام</p>
          </div>

          {/* Card 6: Overall Margin */}
          <div className="p-3.5 rounded-xl border bg-card shadow-xs space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>متوسط هامش الربح</span>
              <Scale className="h-4 w-4 text-foreground" />
            </div>
            <div className={cn("text-lg font-black font-mono", kpis.overallMargin >= 20 ? "text-emerald-600" : kpis.overallMargin >= 8 ? "text-foreground" : "text-rose-600")}>
              %{kpis.overallMargin.toFixed(1)}
            </div>
            <p className="text-[10px] text-muted-foreground">نسبة العائد الصناعي الصافي</p>
          </div>
        </div>

        {/* 4. Main Multi-Tab Analysis Dashboard */}
        <Tabs defaultValue="products" className="w-full space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2 gap-2">
            <TabsList className="bg-muted p-1">
              <TabsTrigger value="products" className="gap-2 text-xs font-bold">
                <Factory className="h-4 w-4 text-emerald-600" />
                تحليل أرباح وجدوى المنتجات المصنعة ({filteredProducts.length})
              </TabsTrigger>
              <TabsTrigger value="materials" className="gap-2 text-xs font-bold">
                <Package className="h-4 w-4 text-foreground" />
                مقارنة المواد الخام (المشترى vs المستهلك vs التالف) ({filteredRawMaterials.length})
              </TabsTrigger>
            </TabsList>

            {/* Quick Feasibility Filter Buttons for Tab 1 */}
            <div className="flex items-center gap-1.5 flex-wrap no-print">
              <span className="text-[11px] font-semibold text-muted-foreground ml-1">تصفية القرار:</span>
              <Button
                size="sm"
                variant={filters.feasibilityFilter === 'all' ? 'default' : 'outline'}
                onClick={() => handleFilterChange('feasibilityFilter', 'all')}
                className="h-7 text-[11px] px-2"
              >
                الكل ({manufacturedProductsData.length})
              </Button>
              <Button
                size="sm"
                variant={filters.feasibilityFilter === 'profitable' ? 'default' : 'outline'}
                onClick={() => handleFilterChange('feasibilityFilter', 'profitable')}
                className="h-7 text-[11px] px-2 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
              >
                رابح ومجدي ({kpis.profitableCount})
              </Button>
              <Button
                size="sm"
                variant={filters.feasibilityFilter === 'review' ? 'default' : 'outline'}
                onClick={() => handleFilterChange('feasibilityFilter', 'review')}
                className="h-7 text-[11px] px-2 text-foreground dark:text-foreground border-amber-500/30"
              >
                مراجعة تكلفة ({kpis.reviewCount})
              </Button>
              <Button
                size="sm"
                variant={filters.feasibilityFilter === 'loss' ? 'default' : 'outline'}
                onClick={() => handleFilterChange('feasibilityFilter', 'loss')}
                className="h-7 text-[11px] px-2 text-rose-700 dark:text-rose-400 border-rose-500/30"
              >
                خاسر / أوقف ({kpis.lossCount})
              </Button>
            </div>
          </div>

          {/* TAB 1: FINISHED GOODS FEASIBILITY & PROFITABILITY */}
          <TabsContent value="products" className="space-y-4 m-0">
            <Card className="border shadow-xs">
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Factory className="h-5 w-5 text-emerald-600" />
                    جدول ربحية المنتجات المصنعة ومقياس الاستمرار في الإنتاج
                  </CardTitle>
                  <CardDescription className="text-xs">
                    تُستخدم تكاليف استلامات الإنتاج وأرقام تشغيلاتها عند توفرها، مع الرجوع لتكلفة المكونات للأصناف التي لا تملك تشغيلات مسجلة.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span>جاري تحليل فواتير المبيعات وتكلفة الخامات...</span>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground space-y-2">
                    <Package className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                    <p className="font-semibold text-foreground">لا توجد أصناف مصنعة مطابقة للفلاتر المحددة</p>
                    <p className="text-xs">تأكد من وجود أصناف بنوع "منتج مصنّع" مسجل لها معادلة تصنيع (Components) في شاشة الأصناف.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50 text-xs">
                        <TableRow>
                          <TableHead className="w-[50px] text-center">#</TableHead>
                          <TableHead className="min-w-[180px]">اسم الصنف المصنّع</TableHead>
                          <TableHead className="text-center font-mono">الكمية المباعة</TableHead>
                          <TableHead className="text-center font-mono">الإنتاج الفعلي</TableHead>
                          <TableHead className="text-center font-mono">إجمالي الإيرادات</TableHead>
                          <TableHead className="text-center font-mono">تكلفة التصنيع المباع</TableHead>
                          <TableHead className="text-center font-mono">الخامات المستهلكة فعليًا</TableHead>
                          <TableHead className="text-center font-mono">إجمالي تكلفة الإنتاج</TableHead>
                          <TableHead className="text-center font-mono">الإعدامات والتوالف</TableHead>
                          <TableHead className="text-center font-mono">صافي ربح التصنيع</TableHead>
                          <TableHead className="text-center font-mono">هامش التصنيع المستهدف</TableHead>
                          <TableHead className="text-center font-mono">هامش الربح</TableHead>
                          <TableHead className="text-center min-w-[150px]">مقياس الاستمرارية والقرار</TableHead>
                          <TableHead className="text-center no-print w-[90px]">المكونات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs font-medium">
                        {filteredProducts.map((p, idx) => (
                          <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-center font-mono text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="font-bold text-foreground">{p.name}</div>
                              <div className="text-[11px] font-mono text-muted-foreground">كود: {p.code} | سعر البيع الحالي: {p.price.toFixed(2)} ج.م</div>
                              {p.suggestedSalePrice > 0 && <div className="text-[11px] font-mono text-emerald-700">السعر المحسوب: {p.suggestedSalePrice.toFixed(2)} ج.م</div>}
                              {p.allocatedWasteCost > 0 && <div className="text-[10px] font-mono text-foreground">الهدر الموزع: {p.allocatedWasteCost.toFixed(2)} ج.م | متوسط القطعة: {p.allocatedWasteCostPerUnit.toFixed(4)} ج.م</div>}
                              <div className="text-[10px] font-mono text-primary">التشغيلات: {p.batchNumbers || 'لا توجد تشغيلات بالفترة'}</div>
                              {(p.normalScrapQty > 0 || p.abnormalScrapQty > 0) && <div className="text-[10px] font-mono text-muted-foreground">هالك طبيعي: {p.normalScrapQty} | غير طبيعي: {p.abnormalScrapQty}</div>}
                            </TableCell>
                            <TableCell className="text-center font-mono font-bold">
                              {p.soldQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center font-mono font-bold text-foreground">{p.producedQty.toLocaleString()}</TableCell>
                            <TableCell className="text-center font-mono font-bold text-foreground">
                              {p.salesRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center font-mono text-foreground dark:text-foreground">
                              {p.materialCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-center font-mono text-foreground">{p.actualMaterialCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-center font-mono">{p.actualProductionCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-center font-mono">
                              {p.wasteCost > 0 ? (
                                <span className="text-rose-600 font-bold">
                                  {p.wasteCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({p.wasteQty})
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">0.00</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center font-mono font-black">
                              <span className={cn(
                                "px-2 py-0.5 rounded",
                                p.netManufacturingProfit >= 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                              )}>
                                {p.netManufacturingProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </TableCell>
                            <TableCell className="text-center font-mono">{p.manufacturingProfitMargin > 0 ? `%${p.manufacturingProfitMargin.toFixed(1)}` : '—'}</TableCell>
                            <TableCell className="text-center font-mono font-bold">
                              <span className={cn(
                                p.marginPercentage >= 25 ? "text-emerald-600" : p.marginPercentage >= 8 ? "text-foreground" : "text-rose-600"
                              )}>
                                %{p.marginPercentage.toFixed(1)}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Badge variant="outline" className={cn("text-[11px] font-bold px-2 py-0.5", p.statusBadgeClass)}>
                                  {p.statusLabel}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground text-center line-clamp-1 max-w-[200px]" title={p.recommendation}>
                                  {p.recommendation}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center no-print">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs gap-1 text-foreground dark:text-foreground hover:bg-sky-500/10"
                                onClick={() => setSelectedProductForModal(p)}
                                title="عرض المواد الخام المكونة لهذا المنتج"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                الخامات
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter className="bg-muted/70 text-xs font-bold">
                        <TableRow>
                          <TableCell colSpan={2} className="text-right">الإجمالي العام للمنتجات المصنعة ({filteredProducts.length} صنف)</TableCell>
                          <TableCell className="text-center font-mono">
                            {filteredProducts.reduce((acc, p) => acc + p.soldQty, 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center font-mono text-foreground">
                            {filteredProducts.reduce((acc, p) => acc + p.producedQty, 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center font-mono text-emerald-700 dark:text-emerald-400">
                            {filteredProducts.reduce((acc, p) => acc + p.salesRevenue, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono text-foreground dark:text-foreground">
                            {filteredProducts.reduce((acc, p) => acc + p.materialCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono text-foreground">
                            {filteredProducts.reduce((acc, p) => acc + p.actualMaterialCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            {filteredProducts.reduce((acc, p) => acc + p.actualProductionCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono text-rose-600">
                            {filteredProducts.reduce((acc, p) => acc + p.wasteCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono text-emerald-700 dark:text-emerald-400">
                            {filteredProducts.reduce((acc, p) => acc + p.netManufacturingProfit, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold" colSpan={4}>
                            متوسط الهامش: %{kpis.overallMargin.toFixed(1)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: RAW MATERIALS COMPARISON (PURCHASED VS CONSUMED VS WASTED) */}
          <TabsContent value="materials" className="space-y-4 m-0">
            <Card className="border shadow-xs">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Package className="h-5 w-5 text-foreground" />
                  مقارنة حركة المواد الخام: المشتريات مقابل الاستهلاك الفعلي والتوالف
                </CardTitle>
                <CardDescription className="text-xs">
                  مقارنة إجمالي ما تم شراؤه من كل خامة بما تم سحبه فعلياً في التصنيع وما تم إعدامه كفقد أو تلف خلال نفس الفترة.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span>جاري تحليل فواتير شراء الخامات وحركات الاستهلاك...</span>
                  </div>
                ) : filteredRawMaterials.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground space-y-2">
                    <Package className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                    <p className="font-semibold text-foreground">لا توجد مواد خام مسجلة</p>
                    <p className="text-xs">تأكد من تعريف المواد الخام بنوع "مادة خام" وإدخال فواتير شراء لها.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50 text-xs">
                        <TableRow>
                          <TableHead className="w-[50px] text-center">#</TableHead>
                          <TableHead className="min-w-[170px]">اسم المادة الخام</TableHead>
                          <TableHead className="text-center font-mono bg-sky-500/5">المشترى (كمية)</TableHead>
                          <TableHead className="text-center font-mono bg-sky-500/5">تكلفة المشتريات</TableHead>
                          <TableHead className="text-center font-mono bg-emerald-500/5">المستهلك بالبيع (كمية)</TableHead>
                          <TableHead className="text-center font-mono bg-emerald-500/5">قيمة المستهلك</TableHead>
                          <TableHead className="text-center font-mono bg-rose-500/5">المعدوم والتالف (كمية)</TableHead>
                          <TableHead className="text-center font-mono bg-rose-500/5">تكلفة الإعدام</TableHead>
                          <TableHead className="text-center font-mono">الفارق المخزني (المتبقي)</TableHead>
                          <TableHead className="text-center min-w-[150px]">المنتجات المستخدمة بها</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs font-medium">
                        {filteredRawMaterials.map((r, idx) => (
                          <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-center font-mono text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="font-bold text-foreground">{r.name}</div>
                              <div className="text-[11px] font-mono text-muted-foreground">كود: {r.code} | الوحدة: {r.unit}</div>
                            </TableCell>
                            
                            {/* Purchases */}
                            <TableCell className="text-center font-mono font-bold bg-sky-500/5 text-foreground dark:text-foreground">
                              {r.netPurchasedQty.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center font-mono font-bold bg-sky-500/5 text-foreground dark:text-foreground">
                              {r.netPurchasedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>

                            {/* Consumed */}
                            <TableCell className="text-center font-mono font-bold bg-emerald-500/5 text-emerald-800 dark:text-emerald-300">
                              {r.consumedQty.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center font-mono font-bold bg-emerald-500/5 text-emerald-800 dark:text-emerald-300">
                              {r.consumedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>

                            {/* Waste */}
                            <TableCell className="text-center font-mono bg-rose-500/5">
                              {r.wasteQty > 0 ? (
                                <span className="text-rose-600 font-bold">{r.wasteQty.toFixed(2)}</span>
                              ) : (
                                <span className="text-muted-foreground/60">0.00</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center font-mono bg-rose-500/5">
                              {r.wasteCost > 0 ? (
                                <span className="text-rose-600 font-bold">{r.wasteCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              ) : (
                                <span className="text-muted-foreground/60">0.00</span>
                              )}
                            </TableCell>

                            {/* Variance Balance */}
                            <TableCell className="text-center font-mono font-bold">
                              <span className={cn(
                                "px-2 py-0.5 rounded",
                                r.varianceQty >= 0 ? "bg-slate-500/10 text-foreground" : "bg-amber-500/15 text-foreground dark:text-foreground"
                              )}>
                                {r.varianceQty.toFixed(2)} {r.unit}
                              </span>
                            </TableCell>

                            {/* Used In Products */}
                            <TableCell className="text-center">
                              {r.usedInProducts.length > 0 ? (
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {r.usedInProducts.map((pName, pIdx) => (
                                    <span key={pIdx} className="text-[10px] bg-muted px-1.5 py-0.5 rounded border">
                                      {pName}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">لم تُستخدم في إنتاج مسجل</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter className="bg-muted/70 text-xs font-bold">
                        <TableRow>
                          <TableCell colSpan={2} className="text-right">الإجمالي العام لحركة المواد الخام</TableCell>
                          <TableCell className="text-center font-mono">-</TableCell>
                          <TableCell className="text-center font-mono text-foreground dark:text-foreground">
                            {filteredRawMaterials.reduce((acc, r) => acc + r.netPurchasedCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono">-</TableCell>
                          <TableCell className="text-center font-mono text-emerald-800 dark:text-emerald-300">
                            {filteredRawMaterials.reduce((acc, r) => acc + r.consumedCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono">-</TableCell>
                          <TableCell className="text-center font-mono text-rose-600">
                            {filteredRawMaterials.reduce((acc, r) => acc + r.wasteCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center font-mono" colSpan={2}>-</TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* MODAL: BOM COMPONENTS BREAKDOWN */}
      <Dialog open={!!selectedProductForModal} onOpenChange={(open) => !open && setSelectedProductForModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Layers className="h-5 w-5 text-emerald-600" />
              المواد الخام المكونة للصنف: {selectedProductForModal?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              تفاصيل الخامات ونسب الاستهلاك المحسوبة لكل وحدة ولإجمالي الكمية المباعة ({selectedProductForModal?.soldQty} وحدة).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2 p-3 bg-muted/40 rounded-lg text-xs font-mono">
              <div>
                <span className="text-muted-foreground block text-[10px]">الكمية المباعة:</span>
                <span className="font-bold text-foreground text-sm">{selectedProductForModal?.soldQty} وحدة</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">إجمالي إيراد الصنف:</span>
                <span className="font-bold text-emerald-600 text-sm">{selectedProductForModal?.salesRevenue?.toFixed(2)} ج.م</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">تكلفة خاماته المستهلكة:</span>
                <span className="font-bold text-foreground text-sm">{selectedProductForModal?.materialCost?.toFixed(2)} ج.م</span>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-muted text-xs">
                  <TableRow>
                    <TableHead>المادة الخام</TableHead>
                    <TableHead className="text-center font-mono">الكمية لكل وحدة</TableHead>
                    <TableHead className="text-center font-mono">إجمالي المستهلك</TableHead>
                    <TableHead className="text-center font-mono">تكلفة الوحدة</TableHead>
                    <TableHead className="text-center font-mono">التكلفة الإجمالية</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {selectedProductForModal?.componentsBreakdown?.length > 0 ? (
                    selectedProductForModal.componentsBreakdown.map((c: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <div className="font-bold">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">كود: {c.code}</div>
                        </TableCell>
                        <TableCell className="text-center font-mono">{c.unitRequired} {c.unit}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {c.totalQtyUsed.toFixed(2)} {c.unit}
                        </TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{c.unitCost.toFixed(2)} ج.م</TableCell>
                        <TableCell className="text-center font-mono font-bold">{c.totalCost.toFixed(2)} ج.م</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        لا توجد مكونات مسجلة لهذا الصنف في بطاقة الأصناف.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
