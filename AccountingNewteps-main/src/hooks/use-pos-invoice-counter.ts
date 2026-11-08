"use client";

import { useState, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/data-provider';
import localforage from 'localforage';

export const usePosInvoiceCounter = (workDayId: string | undefined, terminalId: string | undefined, terminalCode: string | undefined, warehouseCode: string | undefined) => {
  const { posSessions, getNextId } = useData();
  const [currentInvoiceNumber, setCurrentInvoiceNumber] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const getFormattedInvoiceNumber = useCallback((count: number | string) => {
      const openWorkDay = posSessions.find((s: any) => s.id === workDayId);
      const workDayDate = openWorkDay ? new Date(openWorkDay.startTime) : new Date();
      const datePart = `${String(workDayDate.getDate()).padStart(2, '0')}${String(workDayDate.getMonth() + 1).padStart(2, '0')}${String(workDayDate.getFullYear()).slice(-2)}`;
      
      return `${count}-${terminalCode || '0'}-${warehouseCode || '0'}-${datePart}`;
  }, [posSessions, workDayId, terminalCode, warehouseCode]);

  const generateInvoiceNumber = useCallback(async (userId?: string) => {
    if (!workDayId || !terminalId) {
      console.error("Cannot generate invoice number: workDayId or terminalId is missing.");
      return null;
    }
    
    const counterKey = `pos_${workDayId}_${terminalId}`;
    try {
      const nextCount = await getNextId(counterKey, 1);
      if (nextCount) {
        const formatted = getFormattedInvoiceNumber(nextCount);
        setCurrentInvoiceNumber(formatted);
        return formatted;
      }
    } catch (err) {
      console.warn("Failed to generate invoice number via SQL Server, falling back to local counter:", err);
    }

    const localCount = (await localforage.getItem<number>(counterKey) || 0) + 1;
    await localforage.setItem(counterKey, localCount);
    const formatted = getFormattedInvoiceNumber(localCount);
    setCurrentInvoiceNumber(formatted);
    return formatted;
  }, [workDayId, terminalId, getNextId, getFormattedInvoiceNumber]);

  return { currentInvoiceNumber, generateInvoiceNumber, loading };
};
