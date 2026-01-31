declare module 'react-native-thermal-receipt-printer' {
  interface PrinterDevice {
    id?: string;
    name?: string;
    address?: string;
    connected?: boolean;
  }

  interface PrinterOptions {
    beep?: boolean;
    cut?: boolean;
    tailingLine?: boolean;
    encoding?: string;
  }

  interface ColumnAlignment {
    text: string;
    width: number;
    align?: 'LEFT' | 'CENTER' | 'RIGHT';
  }

  const ThermalPrinterModule: {
    // Connection methods
    connectPrinter(address: string, type: 'bluetooth' | 'usb' | 'net'): Promise<string>;
    disconnectPrinter(): Promise<void>;
    
    // Bluetooth methods
    getBluetoothDeviceList(): Promise<PrinterDevice[]>;
    
    // Print methods
    printText(text: string, options?: PrinterOptions): Promise<void>;
    printImageUrl(url: string, options?: { width?: number; height?: number }): Promise<void>;
    printImageBase64(base64: string, options?: { width?: number; height?: number }): Promise<void>;
    printBill(text: string, options?: PrinterOptions): Promise<void>;
    printColumnsText(columns: ColumnAlignment[], options?: PrinterOptions): Promise<void>;
    printQRCode(content: string, size?: number, align?: number): Promise<void>;
    printBarCode(content: string, type?: number, width?: number, height?: number, align?: number): Promise<void>;
    
    // Paper feed
    cutPaper(): Promise<void>;
    feedPaper(lines: number): Promise<void>;
    
    // Alignment
    setAlign(align: 'LEFT' | 'CENTER' | 'RIGHT'): Promise<void>;
    
    // Events
    EVENT_CONNECTED: string;
    EVENT_CONNECTION_LOST: string;
  };

  export default ThermalPrinterModule;
}

