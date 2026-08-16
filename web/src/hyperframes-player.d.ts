import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hyperframes-player": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        srcdoc?: string;
        width?: string;
        height?: string;
        controls?: boolean;
        muted?: boolean;
        autoplay?: boolean;
        loop?: boolean;
      };
    }
  }
}
