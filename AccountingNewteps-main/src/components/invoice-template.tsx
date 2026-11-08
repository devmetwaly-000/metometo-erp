
import React, { useState } from 'react';
import Barcode from 'react-barcode';

interface InvoiceTemplateProps {
  invoice: any; 
  company: any; 
  customer?: any; 
  isPurchase?: boolean; 
  isReturn?: boolean; 
  customerBalance?: number; 
}

export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({ invoice, company, customer, isPurchase = false, isReturn = false, customerBalance }) => {
  const [imgError, setImgError] = useState(false);
  
  const logoUrl = company?.logoUrl && company.logoUrl !== "" && company.logoUrl !== "/logo.png"
    ? company.logoUrl 
    : "/logo.png";
    
  const showWatermark = company?.showWatermark === true;
  const watermarkOpacity = company?.watermarkOpacity || 0.1;

  const receiptStyle: React.CSSProperties = {
    width: '210mm', 
    minHeight: '297mm', 
    fontFamily: '"Noto Kufi Arabic", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    fontSize: '14px',
    color: '#000', 
    padding: '20mm',
    boxSizing: 'border-box',
    direction: 'rtl', 
    textAlign: 'right',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    position: 'relative',
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '3px solid #000',
    paddingBottom: '15px',
    marginBottom: '25px',
    backgroundColor: 'transparent',
    position: 'relative',
    zIndex: 1
  };
  
  const h1Style: React.CSSProperties = {
    margin: '0',
    fontSize: '26px',
    fontWeight: 'bold',
    color: '#000'
  };

  const pStyle: React.CSSProperties = {
    margin: '3px 0',
    fontSize: '14px',
    color: '#000'
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '25px',
    fontSize: '14px',
    color: '#000',
    border: '1px solid #000',
    backgroundColor: 'transparent', 
    position: 'relative',
    zIndex: 1
  };

  const thStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '10px',
    textAlign: 'center',
    backgroundColor: 'rgba(245, 245, 245, 0.8)',
    fontWeight: 'bold'
  };
  
  const tdStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '10px',
  };
  
   const totalsContainerStyle: React.CSSProperties = {
    alignSelf: 'flex-end',
    width: '50%',
    marginTop: '25px',
    fontSize: '14px',
    color: '#000',
    position: 'relative',
    zIndex: 1
  };

  const totalsRowStyle: React.CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '6px 0',
      borderBottom: '1px solid #ddd'
  }

  const footerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginTop: 'auto', 
    paddingTop: '20px',
    fontSize: '12px',
    borderTop: '1px solid #000',
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
    width: '120mm',
    height: 'auto',
    pointerEvents: 'none',
    filter: 'grayscale(1)' 
  };

  const invoiceType = isReturn ? 'إشعار دائن (مرتجع مبيعات)' : isPurchase ? 'فاتورة شراء' : 'فاتورة مبيعات';
  const partyLabel = isPurchase ? 'المورد' : 'العميل';
  
  const effectivePartyName = customer?.name || invoice?.customerName || invoice?.supplierName || "عميل نقدي";
  const effectiveCompanyName = company?.companyName || "اسم شركتك";
  const effectiveCompanyAddress = company?.companyAddress || "عنوان الشركة";

  // Calculate balances logic
  const totalAmount = Number(invoice?.total || 0);
  const paidAmount = Number(invoice?.paidAmount ?? 0);
  const netInvoiceImpact = totalAmount - paidAmount;
  const remainingInInvoice = Math.max(0, netInvoiceImpact);
  
  let balanceBefore = 0;
  let balanceAfter = 0;

  if (invoice?.customerBalanceBefore !== undefined || invoice?.supplierBalanceBefore !== undefined) {
      balanceBefore = Number(invoice.customerBalanceBefore ?? invoice.supplierBalanceBefore ?? 0);
      balanceAfter = balanceBefore + netInvoiceImpact;
  } else {
      // Fallback for legacy data
      balanceAfter = customerBalance ?? 0;
      balanceBefore = balanceAfter - netInvoiceImpact;
  }

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

      <header style={headerStyle}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            {!imgError && logoUrl ? (
                <img 
                    src={logoUrl} 
                    alt="Logo" 
                    crossOrigin="anonymous"
                    onError={() => setImgError(true)}
                    style={{ maxWidth: '120px', maxHeight: '100px', objectFit: 'contain', backgroundColor: 'transparent' }} 
                />
            ) : (
                <div style={{ width: '100px', height: '100px', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold' }}>LOGO</span>
                </div>
            )}
            <div>
                <h1 style={h1Style}>{effectiveCompanyName}</h1>
                <p style={pStyle}>{effectiveCompanyAddress}</p>
            </div>
        </div>
        <div style={{textAlign: 'left'}}>
            <h2 style={{...h1Style, fontSize: '24px', marginBottom: '10px'}}>{invoiceType}</h2>
            <p style={pStyle}><strong>رقم الفاتورة:</strong> {invoice?.receiptNumber || invoice?.invoiceNumber}</p>
            <p style={pStyle}><strong>التاريخ:</strong> {invoice?.date ? new Date(invoice.date).toLocaleDateString('ar-EG') : '-'}</p>
        </div>
      </header>
      
      <div style={{marginBottom: '25px', padding: '15px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.7)', position: 'relative', zIndex: 1}}>
        <h3 style={{borderBottom: '2px solid #000', paddingBottom: '5px', marginBottom: '10px', fontWeight: 'bold'}}>بيانات {partyLabel}:</h3>
        <p style={pStyle}><strong>الاسم:</strong> {effectivePartyName}</p>
        {customer?.address && <p style={pStyle}><strong>العنوان:</strong> {customer.address}</p>}
        {(customer?.phone || invoice?.customerPhone) && <p style={pStyle}><strong>الهاتف:</strong> {customer?.phone || invoice?.customerPhone}</p>}
      </div>
      
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{...thStyle, width: '50px'}}>#</th>
            <th style={{...thStyle, textAlign: 'right'}}>الصنف</th>
            <th style={thStyle}>الباركود</th>
            <th style={thStyle}>الكمية</th>
            <th style={thStyle}>السعر</th>
            <th style={thStyle}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {(invoice?.items || []).map((item: any, index: number) => (
            <tr key={index}>
              <td style={{...tdStyle, textAlign: 'center'}}>{index + 1}</td>
              <td style={tdStyle}>{item.name}</td>
              <td style={{...tdStyle, textAlign: 'center', fontFamily: 'monospace', fontSize: '12px'}}>{item.code || '-'}</td>
              <td style={{...tdStyle, textAlign: 'center'}}>{item.qty}</td>
              <td style={{...tdStyle, textAlign: 'center'}}>{(item.price || item.cost)?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td style={{...tdStyle, textAlign: 'center', fontWeight: 'bold'}}>{item.total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={totalsContainerStyle}>
        <div style={totalsRowStyle}><span>الإجمالي الفرعي</span> <span>{(invoice?.subtotal || invoice?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
        {(invoice?.discount > 0) && <div style={totalsRowStyle}><span>الخصم</span> <span>{(invoice?.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
        
        <div style={{...totalsRowStyle, fontWeight: 'bold', fontSize: '18px', borderTop: '2px solid #000', paddingTop: '10px', marginTop: '5px' }}>
            <span>الإجمالي الكلي</span> 
            <span>{(invoice?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م</span>
        </div>
        
        <div style={totalsRowStyle}>
            <span>{isReturn ? 'المبلغ المردود نقداً' : 'المبلغ المدفوع'}</span> 
            <span style={{ fontWeight: 'bold' }}>{(invoice?.paidAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>

        {remainingInInvoice > 0.01 && (
            <div style={{...totalsRowStyle, color: '#d00', fontWeight: 'bold'}}>
                <span>باقي الفاتورة (الآجل)</span>
                <span>{remainingInInvoice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
        )}
        
        <div style={{...totalsRowStyle, marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '5px', color: '#666', fontSize: '13px' }}>
            <span>{isPurchase ? 'المستحق للمورد سابقاً' : 'المستحق على العميل سابقاً'}</span>
            <span>{Math.abs(balanceBefore).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م {balanceBefore < 0 ? '(له)' : '(عليه)'}</span>
        </div>
        <div style={{...totalsRowStyle, borderTop: '2px double #000', paddingTop: '10px', color: '#000', fontWeight: 'bold', backgroundColor: 'rgba(249, 249, 249, 0.8)', padding: '10px' }}>
            <span>{isPurchase ? 'إجمالي مستحقات المورد (الرصيد النهائي)' : 'إجمالي مستحقات العميل (الرصيد النهائي)'}</span>
            <span style={{color: balanceAfter > 0 ? '#d00' : '#080'}}>{Math.abs(balanceAfter).toLocaleString(undefined, { minimumFractionDigits: 2 })} ج.م {balanceAfter < 0 ? '(له)' : '(عليه)'}</span>
        </div>
      </div>

       <footer style={footerStyle}>
        <p style={{fontWeight: 'bold', fontSize: '14px'}}>{company?.invoiceFooter || 'شكرًا لتعاملكم معنا!'}</p>
      </footer>
    </div>
  );
};
