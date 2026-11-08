
"use client";

import React from 'react';

// تعريف واجهات الخصائص للمكون
interface KitchenReceiptProps {
  invoice: any; 
  design: any; 
  customer?: any;
  printerName?: string;
}

export const KitchenReceipt: React.FC<KitchenReceiptProps> = ({ invoice, design, customer, printerName }) => {
  
  const receiptStyle: React.CSSProperties = {
    width: `${design?.receiptWidth || 72}mm`,
    fontFamily: '"Noto Kufi Arabic", "Segoe UI", sans-serif',
    fontSize: `${design?.fontSizes?.items || 16}px`,
    color: '#000',
    padding: '10px',
    boxSizing: 'border-box',
    border: '1px dashed #ccc',
    backgroundColor: '#fff',
    direction: 'rtl',
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '10px',
    fontSize: `${design?.fontSizes?.header || 14}px`,
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '5px 0',
    borderBottom: '1px dashed #eee',
    fontWeight: 'bold',
    fontSize: 'inherit'
  };

  const pStyle: React.CSSProperties = {
    margin: '2px 0',
    fontWeight: 'normal',
  };

  return (
    <div style={receiptStyle} className="kitchen-receipt-area">
      <div style={headerStyle}>
        <p style={{ margin: '0', fontWeight: 'bold' }}>طلب جديد {printerName ? `- ${printerName}` : ''}</p>
        {design?.showDateTime && <p style={{ ...pStyle, fontSize: '10px' }}>{new Date(invoice.date).toLocaleString('ar-EG')}</p>}
        {design?.showOrderReference && invoice.orderReference && <p style={{ ...pStyle, fontWeight: 'bold' }}>رقم الطلب: {invoice.orderReference}</p>}
        {design?.showCashierName && <p style={pStyle}>الكاشير: {invoice.cashierName}</p>}
        {design?.showCustomerName && customer && <p style={pStyle}>العميل: {customer.name}</p>}
      </div>
      
      <div style={{ borderTop: '2px solid #000', paddingTop: '5px' }}>
        {invoice.items.map((item: any, index: number) => (
          <div key={index} style={itemStyle}>
            <span>{item.name}</span>
            <span>x{item.qty}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
