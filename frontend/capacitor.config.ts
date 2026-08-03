import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.phillipwalters.workoutlogger',
  appName: 'Askeo',
  webDir: 'dist',
  plugins: {
    GoogleSignIn: {
      clientId: '257512152576-tsl8n16eq5hej5fledr6djjfpms1m8ns.apps.googleusercontent.com',
      iosClientId: '257512152576-9sc3cp3j240n5f365lqi1e6mcqtmhauf.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
    },
    StatusBar: {
      style: 'DARK',
      overlaysWebView: true,
    },
  },
};

export default config;
