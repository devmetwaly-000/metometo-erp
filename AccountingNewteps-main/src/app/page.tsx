
"use client";

import React from 'react';
import { SplashPage } from '@/components/splash-page';

// The home page now only renders the SplashPage component.
// All conditional logic for layouts has been moved to AppLayout to prevent routing issues.
export default function HomePage() {
    return <SplashPage />;
}
