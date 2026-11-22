"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, History, Clock, CheckCircle2, User, FileText } from "lucide-react";

export interface RecipeHistorySnapshot {
  id: string;
  itemId: string;
  itemCode?: string;
  itemName: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  components: {
    itemId: string;
    quantity: number;
    itemName?: string;
    itemCode?: string;
    unitCostAtSnapshot?: number;
    lineCostAtSnapshot?: number;
  }[];
  totalRecipeCost: number;
  changeNotes?: string;
  changedByName?: string;
  createdAt: string;
}

interface RecipeHistoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  itemId?: string;
  itemName?: string;
}

export default function RecipeHistoryDialog({
  isOpen,
  onOpenChange,
  itemId,
  itemName,
}: RecipeHistoryDialogProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<RecipeHistorySnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    setError(null);

    const url = itemId
      ? `/api/recipes/history?itemId=${encodeURIComponent(itemId)}`
      : `/api/recipes/history`;

    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (data.success) {
          setHistory(data.history || []);
        } else {
          setError(data.message || "تعذر تحميل المستند التاريخي للريسبي");
        }
      })
      .catch(() => {
        if (active) setError("حدث خطأ أثناء الاتصال بالسيرفر");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, itemId]);

  const formatDate = (val?: string | null) => {
    if (!val) return "ساري حتى الآن";
    try {
      return new Date(val).toLocaleString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(val);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <History className="h-5 w-5 text-primary" />
            <span>
              المستند التاريخي للريسبي {itemName ? `— ${itemName}` : "(جميع الأصناف المصنعة)"}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            سجل غير قابل للتعديل يوثّق كل إصدار للريسبي وتكلفته ومكوناته وفترة سريانه لضمان دقة التقارير التاريخية.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span className="text-xs">جاري تحميل المستندات التاريخية...</span>
            </div>
          )}

          {!loading && error && (
            <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs text-center">
              {error}
            </div>
          )}

          {!loading && !error && history.length === 0 && (
            <div className="p-8 rounded-lg border border-dashed text-center text-muted-foreground text-xs space-y-1">
              <FileText className="h-8 w-8 mx-auto opacity-30" />
              <p className="font-semibold">لا توجد مستندات تاريخية مسجلة لهذا الصنف حتى الآن.</p>
              <p>يتم إنشاء أول مستند تاريخي تلقائياً عند حفظ أو تعديل مكونات الريسبي.</p>
            </div>
          )}

          {!loading &&
            !error &&
            history.map((snap) => {
              const isCurrent = !snap.effectiveTo;
              return (
                <div
                  key={snap.id}
                  className={`rounded-xl border p-3.5 space-y-3 ${
                    isCurrent
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={isCurrent ? "default" : "secondary"} className="font-mono">
                        الإصدار v{snap.versionNumber}
                      </Badge>
                      {!itemId && (
                        <span className="font-bold text-sm text-foreground">
                          {snap.itemName} {snap.itemCode ? `(${snap.itemCode})` : ""}
                        </span>
                      )}
                      {isCurrent ? (
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                          <CheckCircle2 className="h-3 w-3 ml-1" />
                          الإصدار المعتمد حالياً
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3 ml-1" />
                          أرشيف تاريخي
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs font-mono font-bold text-primary">
                      إجمالي التكلفة وقتها: {snap.totalRecipeCost.toFixed(2)} ج.م
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground">ساري من:</span>{" "}
                      {formatDate(snap.effectiveFrom)}
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">ساري حتى:</span>{" "}
                      {formatDate(snap.effectiveTo)}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span className="font-semibold text-foreground">بواسطة:</span>{" "}
                      {snap.changedByName || "النظام"}
                    </div>
                  </div>

                  {snap.changeNotes && (
                    <div className="text-[11px] bg-muted/40 rounded-md px-2.5 py-1.5 text-foreground/80">
                      <span className="font-semibold">البيان:</span> {snap.changeNotes}
                    </div>
                  )}

                  <div className="border rounded-lg overflow-hidden bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right text-[11px]">المكوّن / الخام</TableHead>
                          <TableHead className="text-center text-[11px]">الكمية</TableHead>
                          <TableHead className="text-center text-[11px]">تكلفة الوحدة وقتها</TableHead>
                          <TableHead className="text-center text-[11px]">الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(snap.components || []).map((c, idx) => (
                          <TableRow key={`${snap.id}-${c.itemId}-${idx}`} className="text-xs">
                            <TableCell className="font-medium">
                              {c.itemName || c.itemId}
                              {c.itemCode ? (
                                <span className="text-[10px] text-muted-foreground font-mono mr-1.5">
                                  ({c.itemCode})
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-center font-mono">{c.quantity}</TableCell>
                            <TableCell className="text-center font-mono text-muted-foreground">
                              {Number(c.unitCostAtSnapshot || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-center font-mono font-semibold">
                              {Number(
                                c.lineCostAtSnapshot ??
                                  Number(c.quantity || 0) * Number(c.unitCostAtSnapshot || 0)
                              ).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
        </div>

        <div className="pt-2 border-t flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
