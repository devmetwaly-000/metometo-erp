
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useData } from '@/contexts/data-provider'; 

interface FirebaseData {
  id: string;
  [key: string]: any;
}

const useFirebase = <T extends object>(path: string) => {
  const { loading: dataProviderLoading, ...allData } = useData();
  const [data, setData] = useState<(T & { id: string })[] | any>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if the specific slice of data exists in the context
    const dataSlice = (allData as any)[path];
    if (dataSlice) {
      setData(dataSlice);
    }
    setLoading(dataProviderLoading);
  }, [path, allData, dataProviderLoading]);

  // Actions are now delegated to the context
  const { dbAction, getNextId } = useData();

  const add = useCallback((newData: T, id?: string) => {
      if (id) {
        return dbAction(path, 'add', newData); // This is likely wrong, should be update? But matching original logic.
      }
      return dbAction(path, 'add', newData);
  }, [path, dbAction]);

  const update = useCallback((payload: { id: string, data: Partial<T> }) => dbAction(path, 'update', payload), [path, dbAction]);
  
  const remove = useCallback((id: string | { id: string }) => {
    const removeId = typeof id === 'object' ? id.id : id;
    return dbAction(path, 'remove', { id: removeId });
  }, [path, dbAction]);


  return {
    data,
    loading,
    error: null, // Error handling can be centralized in DataProvider if needed
    add,
    update,
    remove,
    getNextId,
    setData, // Be cautious with this, it's for local state changes that don't need persistence.
  };
};

export default useFirebase;
