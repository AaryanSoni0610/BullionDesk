declare module '@vardrz/react-native-bluetooth-escpos-printer' {
  interface PrinterOptions {
    width?: number;
    left?: number;
  }

  interface TextOptions {
    encoding?: string;
    codepage?: number;
    widthtimes?: number;
    heigthtimes?: number;
    fonttype?: number;
  }

  interface BluetoothDevice {
    name: string;
    address: string;
  }

  interface ScanResult {
    paired?: BluetoothDevice[];
    found?: BluetoothDevice[];
  }

  export const BluetoothManager: {
    isBluetoothEnabled(): Promise<boolean>;
    enableBluetooth(): Promise<string[]>;
    disableBluetooth(): Promise<void>;
    scanDevices(): Promise<string | ScanResult>;
    connect(address: string): Promise<void>;
    disconnect(): Promise<void>;
    EVENT_DEVICE_ALREADY_PAIRED: string;
    EVENT_DEVICE_FOUND: string;
    EVENT_DEVICE_DISCOVER_DONE: string;
    EVENT_CONNECTION_LOST: string;
    EVENT_UNABLE_CONNECT: string;
    EVENT_CONNECTED: string;
    EVENT_BLUETOOTH_NOT_SUPPORT: string;
  };

  export const BluetoothEscposPrinter: {
    printerInit(): Promise<void>;
    printerLeftSpace(sp: number): Promise<void>;
    printerLineSpace(sp: number): Promise<void>;
    printerUnderLine(mode: number): Promise<void>;
    printerAlign(align: number): Promise<void>;
    printText(text: string, options?: TextOptions): Promise<void>;
    printColumn(
      columnWidths: number[],
      columnAligns: number[],
      columnTexts: string[],
      options?: TextOptions
    ): Promise<void>;
    printPic(base64: string, options?: PrinterOptions): Promise<void>;
    selfTest(): Promise<void>;
    rotate(rotate: number): Promise<void>;
    setBlob(weight: number): Promise<void>;
    printQRCode(content: string, size: number, correctionLevel: number): Promise<void>;
    printBarCode(
      content: string,
      type: number,
      width: number,
      height: number,
      fontType: number,
      position: number
    ): Promise<void>;
    setWidth(width: number): Promise<void>;
    cutOnePoint(): Promise<void>;
    ALIGN: {
      LEFT: number;
      CENTER: number;
      RIGHT: number;
    };
  };

  export const BluetoothTscPrinter: {
    printLabel(options: any): Promise<void>;
  };
}
