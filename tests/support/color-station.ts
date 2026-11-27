export const researchDeviceId = "e9ab914a-6da6-4ddf-96b5-7053993f36a7";
export const researchStations = JSON.stringify({
  [researchDeviceId]: {
    mode: "research", checkedAt: new Date().toISOString(), calibration: {
      revision: "fake-camera-v1",
      matrix: [0.4124564, 0.3575761, 0.1804375, 0, 0.2126729, 0.7151522, 0.072175, 0, 0.0193339, 0.119192, 0.9503041, 0],
      white: [0.95047, 1, 1.08883],
    },
  },
});
