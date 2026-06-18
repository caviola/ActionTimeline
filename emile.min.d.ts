export type EmileOptions = {
  duration?: number;
  easing?: (t: number) => number;
  after?: () => void;
  delay?: number;
};

export default function emile(
  el: HTMLElement,
  style: string,
  opts?: EmileOptions,
  after?: () => void,
): void;
