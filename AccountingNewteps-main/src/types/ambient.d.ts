declare module 'next/navigation' {
  export function useRouter(): { push: (url: string) => void; back: () => void; [k: string]: unknown };
  export function usePathname(): string;
  export function useParams(): Record<string, string | string[]>;
  export function useSearchParams(): { get: (name: string) => string | null; [k: string]: unknown };
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any
  }
}
