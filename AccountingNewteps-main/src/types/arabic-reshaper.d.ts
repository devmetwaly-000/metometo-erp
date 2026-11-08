declare module 'arabic-reshaper' {
    interface ArabicReshaper {
        convertArabic(text: string): string;
    }
    const ArabicReshaper: ArabicReshaper;
    export default ArabicReshaper;
}
