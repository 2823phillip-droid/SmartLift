import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.phillipwalters.workoutlogger',
  appName: 'SmartLift',
  webDir: 'dist',
  plugins: {
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
