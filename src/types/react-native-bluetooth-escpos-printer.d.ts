declare module 'react-native-esc-pos-printer' {
  export interface PrinterConfig {
    target: string;
    seriesName: string;
    language: string;
  }

  export interface PrinterSeries {
    model: string;
    series: string;
  }

  const EscPosPrinter: {
    init(config: PrinterConfig): Promise<void>;
    printImage(base64: string, width: number): Promise<void>;
    addText(text: string): Promise<void>;
    addTextAlign(align: 'left' | 'center' | 'right'): Promise<void>;
    addTextSize(width: number, height: number): Promise<void>;
    addFeedLine(lines: number): Promise<void>;
    addCut(type: 'CUT_FEED' | 'CUT_NO_FEED'): Promise<void>;
    sendData(): Promise<void>;
    disconnect(): Promise<void>;
  };

  export function getPrinterSeriesByName(name: string): string;

  export default EscPosPrinter;
}


