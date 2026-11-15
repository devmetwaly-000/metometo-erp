"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Keep old links and cached navigation targets working. */
export default function LegacyStockTransfersRoute() {
  const router: any = useRouter();
  useEffect(() => {
    if (router && typeof router.replace === 'function') {
      router.replace('/inventory/transfer');
    }
  }, [router]);
  return null;
}
