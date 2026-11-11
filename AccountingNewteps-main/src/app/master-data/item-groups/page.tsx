"use client";

import React, { useState, useMemo } from "react";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useData } from "@/contexts/data-provider";
import { useToast } from "@/hooks/use-toast";
import {
  PlusCircle,
  Edit,
  Trash2,
  Loader2,
  Grip,
  Layers,
  CheckCircle2,
  Eye,
  EyeOff,
  Package,
  Search,
  Sparkles,
  Check,
  Link2,
  Unlink,
  Palette,
  FolderTree,
} from "lucide-react";

const PRESET_COLORS = [
  { label: "أخضر زمردي", value: "bg-emerald-500", hex: "#10b981" },
  { label: "أزرق ملكي", value: "bg-blue-500", hex: "#3b82f6" },
  { label: "برتقالي كهرماني", value: "bg-amber-500", hex: "#f59e0b" },
  { label: "وردي ياقوتي", value: "bg-rose-500", hex: "#f43f5e" },
  { label: "بنفسجي", value: "bg-purple-500", hex: "#a855f7" },
  { label: "سماوي", value: "bg-cyan-500", hex: "#06b6d4" },
  { label: "برتقالي ناري", value: "bg-orange-500", hex: "#f97316" },
  { label: "نيلي", value: "bg-indigo-500", hex: "#6366f1" },
  { label: "أخضر فيروزي", value: "bg-teal-500", hex: "#14b8a6" },
  { label: "أحمر", value: "bg-red-600", hex: "#dc2626" },
  { label: "رمادي داكن", value: "bg-slate-600", hex: "#475569" },
];

export default function PosItemGroupsPage() {
  const {
    itemGroups,
    itemCategories,
    itemSections,
    items,
    dbAction,
    getNextId,
    loading,
  } = useData();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("custom-groups");

  // Group Add/Edit Dialog State
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formParentCategoryId, setFormParentCategoryId] = useState("none");
  const [formColor, setFormColor] = useState("bg-emerald-500");
  const [formShowOnPos, setFormShowOnPos] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Manage Group Items Dialog State
  const [managingGroup, setManagingGroup] = useState<any | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemFilterMode, setItemFilterMode] = useState<"all" | "linked" | "unlinked">("all");
  const [categoryBulkFilter, setCategoryBulkFilter] = useState<string>("all");
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  const safeGroups = useMemo(() => (Array.isArray(itemGroups) ? itemGroups : []), [itemGroups]);
  const safeCategories = useMemo(() => (Array.isArray(itemCategories) ? itemCategories : []), [itemCategories]);
  const safeSections = useMemo(() => (Array.isArray(itemSections) ? itemSections : []), [itemSections]);
  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  // Count items per group
  const groupItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of safeItems) {
      if (item.itemGroupId) {
        counts[item.itemGroupId] = (counts[item.itemGroupId] || 0) + 1;
      }
    }
    return counts;
  }, [safeItems]);

  // Count items per category
  const categoryItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of safeItems) {
      if (item.categoryId) {
        counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
      }
    }
    return counts;
  }, [safeItems]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return safeGroups;
    return safeGroups.filter(
      (g: any) =>
        (g.name && g.name.toLowerCase().includes(q)) ||
        (g.code && String(g.code).toLowerCase().includes(q))
    );
  }, [safeGroups, searchTerm]);

  // Filtered categories
  const filteredCategories = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return safeCategories;
    return safeCategories.filter(
      (c: any) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.code && String(c.code).toLowerCase().includes(q))
    );
  }, [safeCategories, searchTerm]);

  // Live preview of buttons that will appear on POS
  const activePosButtons = useMemo(() => {
    const cats = safeCategories
      .filter((c: any) => c.showOnPos !== false)
      .map((c: any) => ({ ...c, type: "category" }));
    const grps = safeGroups
      .filter((g: any) => g.showOnPos !== false)
      .map((g: any) => ({ ...g, type: "group" }));
    return [...cats, ...grps];
  }, [safeCategories, safeGroups]);

  const openAddDialog = () => {
    setEditingGroup(null);
    setFormName("");
    const maxCode = safeGroups.reduce((max: number, g: any) => {
      const num = parseInt(String(g.code || "0"), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    setFormCode(String(maxCode + 1));
    setFormParentCategoryId("none");
    setFormColor(PRESET_COLORS[safeGroups.length % PRESET_COLORS.length].value);
    setFormShowOnPos(true);
    setIsGroupDialogOpen(true);
  };

  const openEditDialog = (group: any) => {
    setEditingGroup(group);
    setFormName(group.name || "");
    setFormCode(group.code ? String(group.code) : "");
    setFormParentCategoryId(group.parentCategoryId || "none");
    setFormColor(group.color || "bg-emerald-500");
    setFormShowOnPos(group.showOnPos !== false);
    setIsGroupDialogOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!formName.trim()) {
      toast({
        variant: "destructive",
        title: "بيانات ناقصة",
        description: "يرجى إدخال اسم مجموعة الكاشير.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        code: formCode.trim() || String(await getNextId("itemGroup", 1)),
        parentCategoryId: formParentCategoryId === "none" ? null : formParentCategoryId,
        color: formColor,
        showOnPos: formShowOnPos,
      };

      if (editingGroup?.id) {
        await dbAction("itemGroups", "update", {
          id: editingGroup.id,
          data: payload,
        });
        toast({
          title: "تم التحديث بنجاح",
          description: `تم تحديث مجموعة "${payload.name}" بنجاح.`,
        });
      } else {
        await dbAction("itemGroups", "add", payload);
        toast({
          title: "تمت الإضافة بنجاح",
          description: `تم إنشاء مجموعة الكاشير "${payload.name}" بنجاح.`,
        });
      }
      setIsGroupDialogOpen(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "تعذر حفظ بيانات المجموعة.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (group: any) => {
    try {
      // Unlink items associated with this group first
      const linkedItems = safeItems.filter((i: any) => i.itemGroupId === group.id);
      for (const item of linkedItems) {
        await dbAction("items", "update", {
          id: item.id,
          data: { itemGroupId: "" },
        });
      }
      await dbAction("itemGroups", "remove", { id: group.id });
      toast({
        title: "تم الحذف",
        description: `تم حذف مجموعة "${group.name}" وفك ارتباط ${linkedItems.length} صنف.`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "فشل حذف المجموعة.",
      });
    }
  };

  const handleToggleGroupPos = async (group: any, checked: boolean) => {
    try {
      await dbAction("itemGroups", "update", {
        id: group.id,
        data: { showOnPos: checked },
      });
      toast({
        title: checked ? "تم الإظهار في الكاشير" : "تم الإخفاء من الكاشير",
        description: `مجموعة "${group.name}" ${checked ? "ستظهر الآن" : "لن تظهر"} كزر سريع في شاشة الكاشير.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ في التحديث" });
    }
  };

  const handleToggleCategoryPos = async (category: any, checked: boolean) => {
    try {
      await dbAction("itemCategories", "update", {
        id: category.id,
        data: { showOnPos: checked },
      });
      toast({
        title: checked ? "تم الإظهار في الكاشير" : "تم الإخفاء من الكاشير",
        description: `الفئة "${category.name}" ${checked ? "ستظهر الآن" : "لن تظهر"} كزر سريع في شاشة الكاشير.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ في التحديث" });
    }
  };

  const handleUpdateCategoryColor = async (category: any, color: string) => {
    try {
      await dbAction("itemCategories", "update", {
        id: category.id,
        data: { color },
      });
      toast({
        title: "تم تحديث اللون",
        description: `تم تغيير لون زر الفئة "${category.name}" في الكاشير.`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "خطأ في تحديث اللون" });
    }
  };

  // Items inside the "Manage Group Items" modal
  const dialogFilteredItems = useMemo(() => {
    if (!managingGroup) return [];
    const q = itemSearch.trim().toLowerCase();
    return safeItems.filter((item: any) => {
      if (item.itemType === "raw_material") return false;
      const isLinked = item.itemGroupId === managingGroup.id;
      if (itemFilterMode === "linked" && !isLinked) return false;
      if (itemFilterMode === "unlinked" && isLinked) return false;
      if (categoryBulkFilter !== "all" && item.categoryId !== categoryBulkFilter) return false;

      if (!q) return true;
      return (
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.code && String(item.code).toLowerCase().includes(q)) ||
        (item.barcode && String(item.barcode).toLowerCase().includes(q))
      );
    });
  }, [safeItems, managingGroup, itemSearch, itemFilterMode, categoryBulkFilter]);

  const handleToggleItemLink = async (item: any) => {
    if (!managingGroup) return;
    const isCurrentlyLinked = item.itemGroupId === managingGroup.id;
    try {
      await dbAction("items", "update", {
        id: item.id,
        data: { itemGroupId: isCurrentlyLinked ? "" : managingGroup.id },
      });
    } catch (error) {
      toast({ variant: "destructive", title: "خطأ في تحديث ارتباط الصنف" });
    }
  };

  const handleBulkLinkVisible = async (link: boolean) => {
    if (!managingGroup || dialogFilteredItems.length === 0) return;
    setIsBulkUpdating(true);
    try {
      const targetItems = dialogFilteredItems.filter((item: any) =>
        link ? item.itemGroupId !== managingGroup.id : item.itemGroupId === managingGroup.id
      );
      for (const item of targetItems) {
        await dbAction("items", "update", {
          id: item.id,
          data: { itemGroupId: link ? managingGroup.id : "" },
        });
      }
      toast({
        title: link ? "تم ربط الأصناف بنجاح" : "تم فك ارتباط الأصناف",
        description: `تم تحديث ${targetItems.length} صنف في مجموعة "${managingGroup.name}".`,
      });
    } catch (e) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء التحديث الجماعي" });
    } finally {
      setIsBulkUpdating(false);
    }
  };

  const renderColorBadge = (color?: string) => {
    const c = color || "bg-emerald-500";
    const isHex = c.startsWith("#");
    return (
      <span
        className={`inline-block h-4 w-4 rounded-full border shadow-sm shrink-0 ${!isHex ? c : ""}`}
        style={isHex ? { backgroundColor: c } : undefined}
      />
    );
  };

  return (
    <>
      <PageHeader title="مجموعات أصناف الكاشير (POS Quick Groups)">
        <Button onClick={openAddDialog} className="gap-1.5 font-bold shadow-sm">
          <PlusCircle className="h-4 w-4" />
          إضافة مجموعة كاشير جديدة
        </Button>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 md:gap-6 md:p-6">
        {/* KPIs Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">مجموعات الكاشير المخصصة</p>
                <p className="text-2xl font-black text-primary mt-1">{safeGroups.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                <Grip className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">أزرار نشطة في شاشة الكاشير</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{activePosButtons.length}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600">
                <Eye className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">الفئات المخزنية المعروضة</p>
                <p className="text-2xl font-black text-blue-600 mt-1">
                  {safeCategories.filter((c: any) => c.showOnPos !== false).length} / {safeCategories.length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-600">
                <FolderTree className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">أصناف مربوطة بمجموعات كاشير</p>
                <p className="text-2xl font-black text-amber-600 mt-1">
                  {safeItems.filter((i: any) => !!i.itemGroupId).length}
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-600">
                <Package className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Preview of POS Screen Quick Buttons */}
        <Card className="border-dashed bg-muted/20">
          <CardHeader className="py-3 px-4 border-b bg-muted/40">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                معاينة حية لأزرار المجموعات في شاشة الكاشير ({activePosButtons.length} زر مفعل)
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                هكذا تظهر التبويبات السريعة للكاشير أثناء البيع
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <div className="h-14 min-w-[105px] px-3 rounded-lg border bg-secondary text-secondary-foreground flex flex-col items-center justify-center gap-1 text-xs font-bold shrink-0 shadow-sm">
                <Grip className="h-4 w-4" />
                <span>كل الأصناف</span>
              </div>
              {activePosButtons.map((btn: any) => (
                <div
                  key={`${btn.type}-${btn.id}`}
                  className="h-14 min-w-[110px] px-3 rounded-lg border bg-background hover:bg-accent/50 flex flex-col items-center justify-center gap-1.5 text-xs font-semibold shrink-0 shadow-sm transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {renderColorBadge(btn.color)}
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                      {btn.type === "group" ? "مجموعة" : "فئة"}
                    </Badge>
                  </div>
                  <span className="truncate max-w-[110px]">{btn.name}</span>
                </div>
              ))}
              {activePosButtons.length === 0 && (
                <p className="text-xs text-muted-foreground py-3 px-2">
                  لا توجد مجموعات أو فئات مفعلة للظهور في الكاشير حالياً. قم بتفعيلها أو إضافة مجموعة جديدة بالأسفل.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Search & Tabs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">إدارة مجموعات وفئات شاشة الكاشير</CardTitle>
                <CardDescription>
                  أنشئ مجموعات سريعة مخصصة للكاشير (مثل: مشروبات ساخنة، عروض اليوم، الأكثر مبيعاً) واربط الأصناف بها، أو تحكم في إظهار الفئات المخزنية.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم المجموعة أو الكود..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-9 h-9"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4 h-10">
                <TabsTrigger value="custom-groups" className="font-bold gap-2">
                  <Grip className="h-4 w-4" />
                  مجموعات الكاشير المخصصة ({safeGroups.length})
                </TabsTrigger>
                <TabsTrigger value="inventory-categories" className="font-bold gap-2">
                  <Layers className="h-4 w-4" />
                  الفئات المخزنية في الكاشير ({safeCategories.length})
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: Custom POS Groups */}
              <TabsContent value="custom-groups" className="mt-0">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="text-center py-12 border rounded-xl bg-muted/10 space-y-3">
                    <Grip className="h-10 w-10 text-muted-foreground mx-auto opacity-60" />
                    <div className="space-y-1">
                      <p className="font-bold text-base">لا توجد مجموعات كاشير مخصصة حالياً</p>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        مجموعات الكاشير المخصصة تتيح لك تجميع أصناف مختارة تحت زر سريع واحد في شاشة البيع لتسريع عمل الكاشير.
                      </p>
                    </div>
                    <Button onClick={openAddDialog} className="gap-1.5">
                      <PlusCircle className="h-4 w-4" />
                      إنشاء أول مجموعة كاشير
                    </Button>
                  </div>
                ) : (
                  <div className="w-full overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="w-20 text-right">الكود</TableHead>
                          <TableHead className="text-right">اسم مجموعة الكاشير</TableHead>
                          <TableHead className="text-right">الفئة المرتبطة</TableHead>
                          <TableHead className="text-center">لون الزر</TableHead>
                          <TableHead className="text-center">عدد الأصناف</TableHead>
                          <TableHead className="text-center">الظهور في الكاشير</TableHead>
                          <TableHead className="text-center w-48">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredGroups.map((group: any) => {
                          const parentCat = safeCategories.find(
                            (c: any) => c.id === group.parentCategoryId
                          );
                          const itemCount = groupItemCounts[group.id] || 0;
                          const isShown = group.showOnPos !== false;

                          return (
                            <TableRow key={group.id} className="hover:bg-muted/30">
                              <TableCell className="font-mono font-bold text-xs">
                                {group.code || "-"}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2 font-bold">
                                  {renderColorBadge(group.color)}
                                  <span>{group.name}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {parentCat ? (
                                  <Badge variant="secondary" className="font-normal">
                                    {parentCat.name}
                                  </Badge>
                                ) : (
                                  <span className="text-xs text-muted-foreground">مجموعة عامة مستقلة</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border bg-background text-xs">
                                  {renderColorBadge(group.color)}
                                  <span className="text-[11px] text-muted-foreground">
                                    {PRESET_COLORS.find((p) => p.value === group.color)?.label || "مخصص"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1.5 font-bold text-xs border-primary/30 hover:bg-primary/10"
                                  onClick={() => {
                                    setManagingGroup(group);
                                    setItemSearch("");
                                    setItemFilterMode("all");
                                    setCategoryBulkFilter(group.parentCategoryId || "all");
                                  }}
                                >
                                  <Package className="h-3.5 w-3.5 text-primary" />
                                  <span>{itemCount} صنف</span>
                                  <span className="text-[10px] text-primary underline mr-1">
                                    (إدارة الأصناف)
                                  </span>
                                </Button>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <Switch
                                    checked={isShown}
                                    onCheckedChange={(val) => handleToggleGroupPos(group, !!val)}
                                  />
                                  <span
                                    className={`text-xs font-semibold ${
                                      isShown ? "text-emerald-600" : "text-muted-foreground"
                                    }`}
                                  >
                                    {isShown ? "ظاهر" : "مخفي"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="تعديل المجموعة"
                                    onClick={() => openEditDialog(group)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>

                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        title="حذف المجموعة"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>تأكيد حذف مجموعة الكاشير</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          هل أنت متأكد من حذف مجموعة &quot;{group.name}&quot;؟ سيتم فك ارتباط الأصناف التابعة لها ({itemCount} صنف) دون حذف الأصناف نفسها.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>إلغاء</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={() => handleDeleteGroup(group)}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          نعم، حذف المجموعة
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              {/* TAB 2: Inventory Categories on POS */}
              <TabsContent value="inventory-categories" className="mt-0">
                <div className="w-full overflow-auto rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="w-20 text-right">الكود</TableHead>
                        <TableHead className="text-right">اسم الفئة الرئيسية</TableHead>
                        <TableHead className="text-right">القسم التابع</TableHead>
                        <TableHead className="text-center">عدد الأصناف</TableHead>
                        <TableHead className="text-center">لون الزر في الكاشير</TableHead>
                        <TableHead className="text-center">إظهار كزر في الكاشير</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCategories.map((cat: any) => {
                        const sec = safeSections.find((s: any) => s.id === cat.sectionId);
                        const isShown = cat.showOnPos !== false;
                        const count = categoryItemCounts[cat.id] || 0;

                        return (
                          <TableRow key={cat.id} className="hover:bg-muted/30">
                            <TableCell className="font-mono font-bold text-xs">
                              {cat.code || "-"}
                            </TableCell>
                            <TableCell className="font-bold">
                              <div className="flex items-center gap-2">
                                {renderColorBadge(cat.color)}
                                <span>{cat.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {sec ? (
                                <Badge variant="outline">{sec.name}</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{count} صنف</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1 flex-wrap max-w-[220px] mx-auto">
                                {PRESET_COLORS.slice(0, 7).map((c) => (
                                  <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => handleUpdateCategoryColor(cat, c.value)}
                                    title={c.label}
                                    className={`h-5 w-5 rounded-full ${c.value} transition-transform ${
                                      cat.color === c.value
                                        ? "ring-2 ring-offset-2 ring-primary scale-110"
                                        : "opacity-70 hover:opacity-100"
                                    }`}
                                  />
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Switch
                                  checked={isShown}
                                  onCheckedChange={(val) => handleToggleCategoryPos(cat, !!val)}
                                />
                                <span
                                  className={`text-xs font-semibold ${
                                    isShown ? "text-emerald-600" : "text-muted-foreground"
                                  }`}
                                >
                                  {isShown ? "ظاهر في الكاشير" : "مخفي"}
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredCategories.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            لا توجد فئات مخزنية مطابقة للبحث.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      {/* Dialog 1: Add / Edit POS Group */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Grip className="h-5 w-5 text-primary" />
              {editingGroup ? `تعديل مجموعة: ${editingGroup.name}` : "إضافة مجموعة أصناف كاشير جديدة"}
            </DialogTitle>
            <DialogDescription>
              حدد اسم المجموعة، لون الزر المميز في شاشة الكاشير، وإعدادات الظهور.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="group-name">اسم المجموعة في الكاشير *</Label>
                <Input
                  id="group-name"
                  placeholder="مثال: مشروبات ساخنة / عروض سريعة"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="group-code">كود المجموعة</Label>
                <Input
                  id="group-code"
                  placeholder="تلقائي"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  className="font-mono text-center"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>الفئة المخزنية الأب (اختياري)</Label>
              <Select value={formParentCategoryId} onValueChange={setFormParentCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الفئة المرتبطة (أو اتركها عامة)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">مجموعة كاشير عامة (غير مقيدة بفئة)</SelectItem>
                  {safeCategories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Palette className="h-4 w-4 text-primary" />
                لون الزر في شاشة الكاشير
              </Label>
              <div className="grid grid-cols-6 gap-2 p-2.5 border rounded-lg bg-muted/20">
                {PRESET_COLORS.map((c) => {
                  const isSelected = formColor === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormColor(c.value)}
                      className={`h-8 rounded-md ${c.value} flex items-center justify-center text-white transition-all ${
                        isSelected
                          ? "ring-2 ring-offset-2 ring-primary scale-105 shadow-md"
                          : "opacity-80 hover:opacity-100"
                      }`}
                      title={c.label}
                    >
                      {isSelected && <Check className="h-4 w-4 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="show-on-pos" className="font-bold cursor-pointer">
                  إظهار المجموعة في شاشة الكاشير
                </Label>
                <p className="text-xs text-muted-foreground">
                  عند التفعيل ستظهر المجموعة كزر وصول سريع للكاشير.
                </p>
              </div>
              <Switch
                id="show-on-pos"
                checked={formShowOnPos}
                onCheckedChange={(v) => setFormShowOnPos(!!v)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveGroup} disabled={isSaving} className="gap-1.5 font-bold">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ المجموعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Manage & Link Items to POS Group */}
      <Dialog
        open={!!managingGroup}
        onOpenChange={(open) => {
          if (!open) setManagingGroup(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {managingGroup && renderColorBadge(managingGroup.color)}
              <span>إدارة وربط أصناف مجموعة: {managingGroup?.name}</span>
              <Badge variant="secondary" className="mr-2">
                {managingGroup ? groupItemCounts[managingGroup.id] || 0 : 0} صنف مرتبط
              </Badge>
            </DialogTitle>
            <DialogDescription>
              اختر الأصناف التي تريد إظهارها عند الضغط على زر مجموعة &quot;{managingGroup?.name}&quot; في شاشة الكاشير.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-2 flex-1 overflow-hidden">
            {/* Filters & Bulk Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative sm:col-span-1">
                <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم الصنف أو الباركود..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="pr-8 h-9 text-xs"
                />
              </div>

              <Select value={categoryBulkFilter} onValueChange={setCategoryBulkFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="تصفية حسب الفئة الرئيسية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفئات الرئيسية</SelectItem>
                  {safeCategories.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex rounded-md border p-0.5 bg-muted/40 h-9">
                <button
                  type="button"
                  onClick={() => setItemFilterMode("all")}
                  className={`flex-1 text-xs rounded-sm font-medium transition-colors ${
                    itemFilterMode === "all" ? "bg-background shadow-sm font-bold" : "text-muted-foreground"
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setItemFilterMode("linked")}
                  className={`flex-1 text-xs rounded-sm font-medium transition-colors ${
                    itemFilterMode === "linked" ? "bg-background shadow-sm font-bold text-emerald-600" : "text-muted-foreground"
                  }`}
                >
                  المرتبطة فقط
                </button>
                <button
                  type="button"
                  onClick={() => setItemFilterMode("unlinked")}
                  className={`flex-1 text-xs rounded-sm font-medium transition-colors ${
                    itemFilterMode === "unlinked" ? "bg-background shadow-sm font-bold" : "text-muted-foreground"
                  }`}
                >
                  غير المرتبطة
                </button>
              </div>
            </div>

            {/* Bulk Action Bar */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border text-xs">
              <span className="text-muted-foreground">
                الأصناف المعروضة بالفلتر الحالي: <strong>{dialogFilteredItems.length}</strong> صنف
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10"
                  disabled={isBulkUpdating || dialogFilteredItems.length === 0}
                  onClick={() => handleBulkLinkVisible(true)}
                >
                  {isBulkUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                  ربط كل المعروض بالمجموعة
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10"
                  disabled={isBulkUpdating || dialogFilteredItems.length === 0}
                  onClick={() => handleBulkLinkVisible(false)}
                >
                  <Unlink className="h-3 w-3" />
                  فك ربط المعروض
                </Button>
              </div>
            </div>

            {/* Items List */}
            <div className="flex-1 overflow-y-auto border rounded-lg max-h-[48vh]">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-right">الكود / الباركود</TableHead>
                    <TableHead className="text-right">اسم الصنف</TableHead>
                    <TableHead className="text-center">السعر</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center w-32">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dialogFilteredItems.map((item: any) => {
                    const isLinked = managingGroup && item.itemGroupId === managingGroup.id;
                    const otherGroup =
                      item.itemGroupId && (!managingGroup || item.itemGroupId !== managingGroup.id)
                        ? safeGroups.find((g: any) => g.id === item.itemGroupId)
                        : null;

                    return (
                      <TableRow
                        key={item.id}
                        className={isLinked ? "bg-emerald-500/5 hover:bg-emerald-500/10" : ""}
                      >
                        <TableCell className="font-mono text-xs">
                          {item.code || item.barcode || "-"}
                        </TableCell>
                        <TableCell className="font-semibold text-xs sm:text-sm">
                          {item.name}
                        </TableCell>
                        <TableCell className="text-center font-bold text-xs">
                          {Number(item.price || 0).toLocaleString()} ج.م
                        </TableCell>
                        <TableCell className="text-center">
                          {isLinked ? (
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              مرتبط بالمجموعة
                            </Badge>
                          ) : otherGroup ? (
                            <Badge variant="outline" className="text-[10px]">
                              في مجموعة: {otherGroup.name}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">غير مرتبط</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant={isLinked ? "destructive" : "default"}
                            className="h-7 text-xs w-24 gap-1"
                            onClick={() => handleToggleItemLink(item)}
                          >
                            {isLinked ? (
                              <>
                                <Unlink className="h-3 w-3" />
                                فك الربط
                              </>
                            ) : (
                              <>
                                <Link2 className="h-3 w-3" />
                                ربط
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {dialogFilteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        لا توجد أصناف مطابقة للبحث أو الفلتر المحدد.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setManagingGroup(null)} className="w-full sm:w-auto font-bold">
              إغلاق وحفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
