
"use client";

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';

interface DesignElementPositions {
    y: number;
    x: number;
}
interface DesignFontSizes {
    companyName: number;
    itemName: number;
    barcode: number;
    price: number;
}
interface Design {
    name: string;
    companyName: string;
    showCompanyName: boolean;
    showPrice: boolean;
    showCode: boolean;
    showBarcode: boolean;
    labelWidth: number;
    labelHeight: number;
    barcodeType: string;
    barcodeHeight: number;
    rotation?: number;
    fontSizes: DesignFontSizes;
    positions: {
        companyName: DesignElementPositions;
        itemName: DesignElementPositions;
        barcode: DesignElementPositions;
        price: DesignElementPositions;
    }
}
interface Item {
  id?: string;
  code?: string;
  name: string;
  price: number;
  barcodeType?: 'code128' | 'ean13_scale';
}

const calculateEan13CheckDigit = (barcodeWithoutCheckDigit: string): number => {
    if (barcodeWithoutCheckDigit.length !== 12) return 0;
    let sumEven = 0, sumOdd = 0;
    barcodeWithoutCheckDigit.split('').forEach((char, index) => {
        const digit = parseInt(char, 10);
        if ((index + 1) % 2 === 0) sumEven += digit;
        else sumOdd += digit;
    });
    const totalSum = sumOdd + (sumEven * 3);
    const remainder = totalSum % 10;
    return (remainder === 0) ? 0 : 10 - remainder;
};

const BarcodeSvgRenderer: React.FC<{ value: string, design: Design }> = ({ value, design }) => {
    const ref = React.useRef<SVGSVGElement>(null);

    React.useEffect(() => {
        if (ref.current && value) {
            try {
                JsBarcode(ref.current, value, {
                    format: design.barcodeType,
                    width: 1,
                    height: design.barcodeHeight || 20,
                    displayValue: design.showCode,
                    fontSize: design.fontSizes.barcode,
                    margin: 2,
                    background: 'transparent'
                });
            } catch (e) {
                console.error("Barcode generation failed:", e);
            }
        }
    }, [value, design]);

    return <svg ref={ref} />;
};


export const BarcodePreview = ({ item, design, settings }: { item: Item | null, design: Design | null, settings?: any }) => {

    if (!item || !design) {
        return <div className="text-center text-muted-foreground">اختر صنفًا وتصميمًا للعرض</div>;
    }
    
    const fullBarcodeValue = React.useMemo(() => {
        if (item.barcodeType === 'ean13_scale' && item.code && item.code.length === 5) {
            const scaleBarcodePrefix = settings?.main?.financial?.scaleBarcodePrefix || '21';
            const barcodeBase = `${scaleBarcodePrefix}${item.code}00000`.slice(0, 12);
            const checkDigit = calculateEan13CheckDigit(barcodeBase);
            return `${barcodeBase}${checkDigit}`;
        }
        return item.code || "NO_CODE";
    }, [item, settings]);

    return (
        <div 
            className="bg-white shadow-lg overflow-hidden relative"
            style={{
                width: `${design.labelWidth * 2.5}px`, // Render at a larger size for clarity
                height: `${design.labelHeight * 2.5}px`,
                fontFamily: 'sans-serif',
                transform: `rotate(${design.rotation || 0}deg)`
            }}
        >
            {design.showCompanyName && (
                <p style={{ position: 'absolute', top: `${design.positions.companyName.y}%`, left: `${design.positions.companyName.x}%`, transform: 'translate(-50%, -50%)', width: '100%', textAlign: 'center', fontSize: `${design.fontSizes.companyName}px`, fontWeight: 'bold' }}>{design.companyName}</p>
            )}
            <p style={{ position: 'absolute', top: `${design.positions.itemName.y}%`, left: `${design.positions.itemName.x}%`, transform: 'translate(-50%, -50%)', width: '100%', textAlign: 'center', fontSize: `${design.fontSizes.itemName}px`, fontWeight: '600' }}>{item.name}</p>
            
            {design.showBarcode && (
            <div style={{ position: 'absolute', top: `${design.positions.barcode.y}%`, left: `${design.positions.barcode.x}%`, transform: 'translate(-50%, -50%)', width: '90%', boxSizing: 'border-box' }}>
               {design.barcodeType === 'QR' ? (
                    <QRCodeSVG value={fullBarcodeValue} width="100%" height="auto" />
                ) : (
                    <BarcodeSvgRenderer value={fullBarcodeValue} design={design} />
                )}
            </div>
            )}
            {design.showPrice && (
                 <p style={{ position: 'absolute', top: `${design.positions.price.y}%`, left: `${design.positions.price.x}%`, transform: 'translate(-50%, -50%)', width: '100%', textAlign: 'center', fontSize: `${design.fontSizes.price}px`, fontWeight: 'bold' }}>{item.price.toFixed(2)} EGP</p>
            )}
        </div>
    );
};
