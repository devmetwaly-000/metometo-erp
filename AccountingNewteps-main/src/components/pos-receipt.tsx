
"use client";

import React, { useState } from 'react';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';

export const DEFAULT_RECEIPT_SECTION_ORDER = [
  'logo',
  'companyInfo',
  'barcode',
  'invoiceMeta',
  'items',
  'totals',
  'qr',
  'footer',
] as const;

export const PosReceipt = ({ invoice, company, design, warehouse, customer, customerBalance }: { invoice: any, company: any, design: any, warehouse?: any, customer?: any, customerBalance?: number }) => {
  const [imgError, setImgError] = useState(false);
  
  const logoUrl =
    design?.logoUrl && !String(design.logoUrl).includes('placehold.co')
      ? design.logoUrl
      : (company?.logoUrl && company.logoUrl !== "" && company.logoUrl !== "/logo.png"
        ? company.logoUrl
        : "/logo.png");

  const showWatermark = company?.showWatermark === true;
  const watermarkOpacity = company?.watermarkOpacity || 0.1;

  const receiptStyle: React.CSSProperties = {
    width: `${design?.receiptWidth || 72}mm`, 
    fontFamily: 'monospace, "Noto Kufi Arabic", sans-serif',
    fontSize: `${design?.fontSizes?.items || 12}px`,
    color: '#000', 
    padding: '10px',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    direction: 'rtl',
    position: 'relative',
    overflow: 'hidden'
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '15px',
    backgroundColor: 'transparent',
    position: 'relative',
    zIndex: 1
  };

  const h1Style: React.CSSProperties = {
    margin: '0',
    fontSize: `${design?.fontSizes?.companyName || 18}px`,
    fontWeight: 'bold',
    color: '#000'
  };

  const pStyle: React.CSSProperties = {
    margin: '3px 0',
    fontSize: `${design?.fontSizes?.header || 13}px`,
    color: '#000'
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '10px',
    fontSize: `${design?.fontSizes?.items || 12}px`,
    color: '#000',
    backgroundColor: 'transparent', 
    position: 'relative',
    zIndex: 1
  };

  const thStyle: React.CSSProperties = {
    borderBottom: '2px solid #000',
    padding: '5px 2px',
    textAlign: 'right',
    fontWeight: 'bold'
  };

  const tdStyle: React.CSSProperties = {
    padding: '4px 2px',
    verticalAlign: 'top',
  };

  const totalsStyle: React.CSSProperties = {
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '2px solid #000',
    fontSize: `${design?.fontSizes?.totals || 13}px`,
    color: '#000',
    position: 'relative',
    zIndex: 1
  };

  const footerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginTop: '20px',
    fontSize: `${design?.fontSizes?.items || 12}px`,
    color: '#000',
    backgroundColor: 'transparent',
    position: 'relative',
    zIndex: 1
  };

  const watermarkStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    opacity: watermarkOpacity,
    zIndex: 0,
    width: '80%',
    height: 'auto',
    pointerEvents: 'none',
    filter: 'grayscale(1)'
  };
  
  const barcodeValue = invoice?.invoiceNumber || 'N/A';
  const items = invoice?.items || invoice?.cart || [];
  const totalAmount = Number(invoice?.total || 0);
  const paidAmount = Number(invoice?.paidAmount ?? 0);
  const netInvoiceImpact = totalAmount - paidAmount;
  const remainingInInvoice = Math.max(0, netInvoiceImpact);
  
  const BarcodeDisplay = ({ value, design }: { value: string, design: any }) => {
    const ref = React.useRef<SVGSVGElement>(null);

    React.useEffect(() => {
        if (ref.current) {
            try {
                JsBarcode(ref.current, value, {
                    format: "CODE128", 
                    height: 40,
                    displayValue: design?.showCode !== false,
                    fontSize: design?.fontSizes?.barcode || 12,
                    margin: 5,
                    background: "transparent"
                });
            } catch (e) {
                console.error("Barcode generation failed:", e);
            }
        }
    }, [value, design]);

    return <svg ref={ref} />;
  };

  const effectiveCompanyName = company?.companyName || "اسم الشركة";
  const effectiveCompanyAddress = company?.companyAddress || "العنوان";
  const effectivePartyName = customer?.name || invoice?.customerName || "عميل نقدي";

  let balanceBefore = 0;
  let balanceAfter = 0;

  if (invoice?.customerBalanceBefore !== undefined) {
      balanceBefore = Number(invoice.customerBalanceBefore);
      balanceAfter = balanceBefore + netInvoiceImpact;
  } else {
      balanceAfter = customerBalance ?? 0;
      balanceBefore = balanceAfter - netInvoiceImpact;
  }

  const orderedSections = React.useMemo(() => {
    const saved: string[] = Array.isArray(design?.sectionOrder) ? design.sectionOrder : [];
    const validSaved = saved.filter((k) => (DEFAULT_RECEIPT_SECTION_ORDER as readonly string[]).includes(k));
    const missing = DEFAULT_RECEIPT_SECTION_ORDER.filter((k) => !validSaved.includes(k));
    return [...validSaved, ...missing];
  }, [design?.sectionOrder]);

  const renderSection = (sectionKey: string) => {
    switch (sectionKey) {
      case 'logo':
        return (
          <div key="logo" style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
            {invoice?.isCheck && <h2 style={{...h1Style, marginBottom: '10px', border: '2px solid black', padding: '5px'}}>شيك مبدئي</h2>}
            {design?.showLogo !== false && logoUrl && !imgError && (
              <img 
                  src={logoUrl} 
                  alt="logo" 
                  crossOrigin="anonymous" 
                  onError={() => setImgError(true)}
                  style={{ maxWidth: '100px', maxHeight: '100px', margin: '0 auto 10px', objectFit: 'contain', backgroundColor: 'transparent' }} 
              />
            )}
          </div>
        );

      case 'companyInfo':
        return (
          <div key="companyInfo" style={{ ...headerStyle, marginBottom: '8px' }}>
            {design?.showCompanyName !== false && <h1 style={h1Style}>{effectiveCompanyName}</h1>}
            {design?.showAddress !== false && <p style={pStyle}>{effectiveCompanyAddress}</p>}
            {design?.showPhoneNumber !== false && <p style={pStyle}>{company?.phone || 'رقم الهاتف'}</p>}
            <p style={{...pStyle, fontWeight: 'bold', marginTop: '5px', borderTop: '1px dashed #000', paddingTop: '5px'}}>فاتورة مبيعات</p>
          </div>
        );

      case 'barcode':
        if (design?.showBarcode === false || !barcodeValue) return null;
        return (
          <div key="barcode" style={{ display: 'flex', justifyContent: 'center', width: '100%', overflow: 'hidden', minHeight: '60px', backgroundColor: 'transparent', margin: '8px 0', position: 'relative', zIndex: 1 }}>
              <BarcodeDisplay value={barcodeValue} design={design} />
          </div>
        );

      case 'invoiceMeta':
        return (
          <div key="invoiceMeta" style={{ borderBottom: '1px dashed #000', paddingBottom: '8px', marginBottom: '8px', fontSize: `${design?.fontSizes?.header || 13}px`, position: 'relative', zIndex: 1 }}>
            {design?.showInvoiceNumber !== false && <p style={pStyle}>رقم الفاتورة: <span dir="ltr" style={{ display: 'inline-block', unicodeBidi: 'embed' }}>{invoice?.invoiceNumber}</span></p>}
            <p style={pStyle}>التاريخ: {invoice?.date ? new Date(invoice.date).toLocaleString('ar-EG') : '-'}</p>
            {design?.showCashier !== false && <p style={pStyle}>الكاشير: {invoice?.cashierName || '---'}</p>}
            {design?.showCustomerName !== false && <p style={pStyle}>العميل: {effectivePartyName}</p>}
            {design?.showCustomerPhone !== false && (customer?.phone || invoice?.customerPhone) && (
                <p style={pStyle}>هاتف العميل: {customer?.phone || invoice?.customerPhone}</p>
            )}
          </div>
        );

      case 'items':
        return (
          <table key="items" style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>الصنف</th>
                {design?.showItemPrice !== false && <th style={{ ...thStyle, textAlign: 'center' }}>السعر</th>}
                <th style={{ ...thStyle, textAlign: 'center' }}>كمية</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, index: number) => (
                <tr key={`${item.id}-${index}`}>
                  <td style={tdStyle}>{item.name}</td>
                  {design?.showItemPrice !== false && <td style={{ ...tdStyle, textAlign: 'center' }}>{Number(item.price || 0).toFixed(2)}</td>}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{item.qty}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>{Number(item.total ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );

      case 'totals':
        return (
          <div key="totals" style={totalsStyle}>
            <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between' }}><span>الإجمالي:</span> <span>{Number(invoice?.subtotal || 0).toFixed(2)}</span></p>
            {design?.showDiscount !== false && Number(invoice?.discount || 0) > 0 && <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between' }}><span>الخصم:</span> <span style={{color: '#d00'}}>- {Number(invoice.discount).toFixed(2)}</span></p>}
            {design?.showTax !== false && (Number(invoice?.taxAmount ?? invoice?.tax ?? 0) > 0 || invoice?.applyTax) && (
                <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between' }}><span>الضريبة:</span> <span>{Number(invoice?.taxAmount ?? invoice?.tax ?? 0).toFixed(2)}</span></p>
            )}
            {Number(invoice?.tips || 0) > 0 && <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between' }}><span>الإكرامية (Tips):</span> <span>{Number(invoice.tips).toFixed(2)}</span></p>}
            
            <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', margin: '6px 0', borderTop: '1px solid #000', paddingTop: '4px' }}><span>الصافي:</span> <span>{totalAmount.toFixed(2)}</span></p>
            
            <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between' }}><span>المدفوع:</span> <span>{paidAmount.toFixed(2)}</span></p>
            
            {remainingInInvoice > 0.01 && (
                <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: '#d00', borderTop: '1px dashed #ccc', paddingTop: '4px' }}>
                    <span>باقي الفاتورة:</span>
                    <span>{remainingInInvoice.toFixed(2)}</span>
                </p>
            )}

            {customerBalance !== undefined && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '2px double #000' }}>
                    <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666' }}>
                        <span>المستحق سابقاً:</span>
                        <span>{balanceBefore.toFixed(2)}</span>
                    </p>
                    <p style={{ ...pStyle, display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', color: balanceAfter > 0 ? '#d00' : '#080', fontSize: '14px' }}>
                        <span>الرصيد النهائي للعميل:</span>
                        <span>{Math.abs(balanceAfter).toFixed(2)} ج.م {balanceAfter < 0 ? '(له)' : '(عليه)'}</span>
                    </p>
                </div>
            )}
          </div>
        );

      case 'qr':
        if (design?.showEInvoiceQr === false) return null;
        return (
          <div key="qr" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0', position: 'relative', zIndex: 1 }}>
            <div style={{ padding: '6px', backgroundColor: '#fff', border: '1px solid #000', borderRadius: '4px' }}>
              <QRCodeSVG
                value={[
                  `${effectiveCompanyName}`,
                  `إيصال رقم: ${invoice?.invoiceNumber || '-'}`,
                  `التاريخ: ${invoice?.date ? new Date(invoice.date).toLocaleString('ar-EG') : '-'}`,
                  `الإجمالي: ${totalAmount.toFixed(2)} ج.م`,
                  invoice?.etaUuid ? `UUID: ${invoice.etaUuid}` : '',
                ].filter(Boolean).join('\n')}
                size={105}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
                includeMargin={false}
              />
            </div>
            <span style={{ fontSize: '10px', marginTop: '4px', color: '#000' }}>امسح الرمز للتحقق من الفاتورة الإلكترونية</span>
          </div>
        );

      case 'footer':
        return (
          <div key="footer" style={{ ...footerStyle, marginTop: '10px' }}>
            <p style={{marginTop: '4px', fontWeight: 'bold'}}>{company?.invoiceFooter || 'شكرًا لتعاملكم معنا!'}</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div style={receiptStyle} className="bg-white text-black printable-area">
      {showWatermark && !imgError && logoUrl && (
          <img 
            src={logoUrl} 
            alt="watermark" 
            style={watermarkStyle}
            crossOrigin="anonymous"
          />
      )}

      {orderedSections.map((sectionKey) => renderSection(sectionKey))}
    </div>
  );
};
