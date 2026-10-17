export type SpatialQuality = "high" | "medium" | "low";

interface DeviceCapabilities {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  maxTextureSize: number;
  saveData: boolean;
  mobile: boolean;
  reducedMotion: boolean;
}

/** Conservative hardware hints set the initial budget; measured frame pacing may lower it once. */
export function initialSpatialQuality({
  deviceMemory,
  hardwareConcurrency,
  maxTextureSize,
  saveData,
  mobile,
  reducedMotion,
}: DeviceCapabilities): SpatialQuality {
  if (
    reducedMotion ||
    saveData ||
    (deviceMemory !== undefined && deviceMemory <= 4) ||
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 4) ||
    maxTextureSize < 4096
  )
    return "low";

  if (
    mobile ||
    (deviceMemory !== undefined && deviceMemory < 8) ||
    (hardwareConcurrency !== undefined && hardwareConcurrency < 8)
  )
    return "medium";

  return "high";
}

export function lowerSpatialQuality(quality: SpatialQuality): SpatialQuality {
  return quality === "high" ? "medium" : "low";
}

export const spatialQualitySettings = {
  high: { desktopDpr: 1.5, mobileDpr: 1.2, settle: 0.055, anisotropy: 16, textureSize: 2560, ornaments: true },
  medium: { desktopDpr: 1.2, mobileDpr: 1, settle: 0.065, anisotropy: 8, textureSize: 2304, ornaments: true },
  low: { desktopDpr: 0.9, mobileDpr: 0.85, settle: 0.075, anisotropy: 4, textureSize: 1792, ornaments: true },
} as const;
