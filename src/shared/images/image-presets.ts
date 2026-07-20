import type { ImagePreset, ImagePresetName } from './image.types';

export function createImagePresets(input: {
  maxBytes: number;
  webpQuality: number;
}): Record<ImagePresetName, ImagePreset> {
  const common = {
    maxBytes: input.maxBytes,
    minWidth: 32,
    minHeight: 32,
    maxInputPixels: 40_000_000,
    webpQuality: input.webpQuality,
  };
  return {
    category: { ...common, maxOutputEdge: 1600 },
    product: { ...common, maxOutputEdge: 2400 },
    review: { ...common, maxOutputEdge: 1920 },
    avatar: { ...common, maxOutputEdge: 1024 },
  };
}
