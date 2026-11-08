
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useData } from "@/contexts/data-provider";
import { Loader2, Save } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

export default function TargetsPage() {
    const { warehouses, sellers, targets, loading, dbAction } = useData();
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);

    // Local state to hold the input values. This is our single source of truth for the inputs.
    const [branchTargets, setBranchTargets] = useState<Record<string, number | string>>({});
    const [sellerTargets, setSellerTargets] = useState<Record<string, number | string>>({});

    // This effect synchronizes the local state with the database state ONCE
    // when the component loads or when the remote `targets` object changes.
    useEffect(() => {
        if (targets) {
            setBranchTargets(targets.branches || {});
            setSellerTargets(targets.sellers || {});
        }
    }, [targets]);

    const handleTargetChange = (type: 'branches' | 'sellers', id: string, value: string) => {
        const setter = type === 'branches' ? setBranchTargets : setSellerTargets;
        setter(prev => ({ ...prev, [id]: value }));
    };

    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            // Prepare the full object to save, ensuring values are numbers
            const targetsToSave = {
                branches: Object.fromEntries(Object.entries(branchTargets).map(([key, value]) => [key, Number(value) || 0])),
                sellers: Object.fromEntries(Object.entries(sellerTargets).map(([key, value]) => [key, Number(value) || 0])),
            };

            // Call dbAction to update the entire 'targets' node
            await dbAction('targets', 'update', { data: targetsToSave });

            toast({ title: 'تم الحفظ', description: `تم تحديث جميع الأهداف بنجاح.` });
        } catch (error) {
            toast({ variant: 'destructive', title: 'خطأ', description: 'فشل حفظ الأهداف.' });
            console.error("Failed to save targets:", error);
        } finally {
            setIsSaving(false);
        }
    };


    return (
        <>
            <PageHeader title="إدارة الأهداف (التارجت)">
               <Button onClick={handleSaveAll} disabled={isSaving || loading}>
                    {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Save className="ml-2 h-4 w-4" />}
                    حفظ كل التغييرات
               </Button>
            </PageHeader>
            <main className="flex-1 p-4 md:p-6">
                <Card>
                    <CardHeader>
                        <CardTitle>أهداف المبيعات الشهرية</CardTitle>
                        <CardDescription>حدد أهداف المبيعات للفروع أو للبائعين بشكل فردي، ثم اضغط على زر الحفظ في الأعلى.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? <Loader2 className="animate-spin mx-auto"/> : (
                             <Tabs defaultValue="sellers">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="sellers">أهداف البائعين</TabsTrigger>
                                    <TabsTrigger value="branches">أهداف الفروع</TabsTrigger>
                                </TabsList>
                                <TabsContent value="sellers">
                                     <div className="w-full overflow-auto border rounded-lg">
                                         <Table>
                                            <TableHeader><TableRow><TableHead>البائع</TableHead><TableHead className="w-48 text-center">الهدف الشهري</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {sellers.map((s: any) => (
                                                    <TableRow key={s.id}>
                                                        <TableCell>{s.name}</TableCell>
                                                        <TableCell>
                                                             <Input 
                                                                type="number" 
                                                                value={sellerTargets[s.id] || ''} 
                                                                onChange={e => handleTargetChange('sellers', s.id, e.target.value)}
                                                                placeholder="0"
                                                                className="text-center"
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                     </div>
                                </TabsContent>
                                <TabsContent value="branches">
                                    <div className="w-full overflow-auto border rounded-lg">
                                        <Table>
                                            <TableHeader><TableRow><TableHead>الفرع</TableHead><TableHead className="w-48 text-center">الهدف الشهري</TableHead></TableRow></TableHeader>
                                            <TableBody>
                                                {warehouses.map((w: any) => (
                                                    <TableRow key={w.id}>
                                                        <TableCell>{w.name}</TableCell>
                                                        <TableCell>
                                                            <Input 
                                                                type="number" 
                                                                value={branchTargets[w.id] || ''} 
                                                                onChange={e => handleTargetChange('branches', w.id, e.target.value)}
                                                                placeholder="0"
                                                                className="text-center"
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </TabsContent>
                             </Tabs>
                        )}
                    </CardContent>
                </Card>
            </main>
        </>
    );
}
