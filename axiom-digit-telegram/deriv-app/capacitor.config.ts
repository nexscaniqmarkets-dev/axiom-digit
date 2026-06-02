import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.seteeconcepts.axiomdigit',
  appName: 'Axiom Digit',
  webDir: 'dist',
  // Points to your deployed Render backend
  // Replace with your actual Render URL after deploying
  server: {
    url: 'https://axiom-digit-trader.onrender.com',
    cleartext: false,
  },
  android: {
    backgroundColor: '#0f172a',
    allowMixedContent: false,
  },
};

export default config;
