declare module 'react-native-thermal-printer' {
  export interface PrinterInterface {
    payload: string;
    autoCut?: boolean;
    openCashbox?: boolean;
    mmFeedPaper?: number;
    printerDpi?: number;
    printerWidthMM?: number;
    printerNbrCharactersPerLine?: number;
  }

  export interface PrintTcpInterface extends PrinterInterface {
    ip: string;
    port: number;
    timeout?: number;
  }

  export interface PrintBluetoothInterface extends PrinterInterface {}

  const ThermalPrinterModule: {
    defaultConfig: PrintTcpInterface;
    printTcp(config: Partial<PrintTcpInterface> & Pick<PrinterInterface, 'payload'>): Promise<void>;
    printBluetooth(config: Partial<PrintBluetoothInterface> & Pick<PrinterInterface, 'payload'>): Promise<void>;
  };

  export default ThermalPrinterModule;
}



